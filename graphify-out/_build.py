import json, sys, glob
from pathlib import Path
from graphify.detect import detect
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from graphify.cache import check_semantic_cache, save_semantic_cache

root = Path('.')

# Step 2 - Detect
print("=== DETECT ===")
result = detect(root)
total = result['total_files']
words = result['total_words']
print(f"Corpus: {total} files, ~{words} words")
for k, v in result['files'].items():
    if v: print(f"  {k}: {len(v)} files")
open('graphify-out/.graphify_detect.json', 'w').write(json.dumps(result, ensure_ascii=False))

if total == 0:
    print("No files found")
    sys.exit(1)

# Step 3a - AST extraction
print("\n=== AST EXTRACTION ===")
code_files = []
for f in result['files'].get('code', []):
    p = Path(f)
    if p.is_dir():
        code_files.extend(collect_files(p))
    else:
        code_files.append(p)

if code_files:
    ast_result = extract(code_files, cache_root=root)
    open('graphify-out/.graphify_ast.json', 'w').write(json.dumps(ast_result, indent=2, ensure_ascii=False))
    print(f"AST: {len(ast_result['nodes'])} nodes, {len(ast_result['edges'])} edges")
else:
    open('graphify-out/.graphify_ast.json', 'w').write(json.dumps({'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}))
    print("No code files - skipping AST")

# Step 3b - Semantic extraction (skip for code-only, do lightweight for docs)
doc_files = result['files'].get('document', [])
img_files = result['files'].get('image', [])

all_nodes, all_edges, all_hyperedges = [], [], []
total_in, total_out = 0, 0

if doc_files or img_files:
    print(f"\n=== SEMANTIC EXTRACTION ({len(doc_files)} docs, {len(img_files)} images) ===")
    # Check cache
    cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(
        doc_files + img_files
    )
    print(f"Cache: {len(doc_files)+len(img_files)-len(uncached)} hit, {len(uncached)} need extraction")

    if cached_nodes or cached_edges or cached_hyperedges:
        all_nodes.extend(cached_nodes)
        all_edges.extend(cached_edges)
        all_hyperedges.extend(cached_hyperedges)

    if uncached:
        # Use Gemini if key available, otherwise lightweight extraction
        import os
        gemini_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
        if gemini_key:
            print("Using Gemini for semantic extraction...")
            from graphify.llm import extract_corpus_parallel
            semantic = extract_corpus_parallel(uncached, backend="gemini")
        else:
            print("No Gemini key - extracting filename-level metadata only")
            semantic = {'nodes': [], 'edges': [], 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}
            seen_ids = set()
            for f in uncached:
                name = Path(f).stem
                nid = f"file:{f}"
                if nid not in seen_ids:
                    seen_ids.add(nid)
                    semantic['nodes'].append({
                        'id': nid, 'type': 'file', 'label': name,
                        'metadata': {'path': f, 'source_location': f},
                        'evidence': 'EXTRACTED'
                    })
            print(f"  Generated {len(semantic['nodes'])} basic file nodes")

        if semantic.get('nodes'):
            save_semantic_cache(semantic['nodes'], semantic.get('edges', []), semantic.get('hyperedges', []))
            for n in semantic.get('nodes', []):
                if n['id'] not in {x['id'] for x in all_nodes}:
                    all_nodes.append(n)
            all_edges.extend(semantic.get('edges', []))
            all_hyperedges.extend(semantic.get('hyperedges', []))
            total_in = semantic.get('input_tokens', 0)
            total_out = semantic.get('output_tokens', 0)

semantic_result = {
    'nodes': all_nodes, 'edges': all_edges,
    'hyperedges': all_hyperedges,
    'input_tokens': total_in, 'output_tokens': total_out,
}
open('graphify-out/.graphify_semantic.json', 'w').write(json.dumps(semantic_result, indent=2, ensure_ascii=False))

# Step 3c - Merge AST + semantic
print("\n=== MERGE ===")
ast = json.load(open('graphify-out/.graphify_ast.json'))
sem = json.load(open('graphify-out/.graphify_semantic.json'))
seen = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])
merged_edges = ast['edges'] + sem['edges']
merged_hyperedges = sem.get('hyperedges', [])
merged = {
    'nodes': merged_nodes, 'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': sem.get('input_tokens', 0),
    'output_tokens': sem.get('output_tokens', 0),
}
open('graphify-out/.graphify_extract.json', 'w').write(json.dumps(merged, indent=2, ensure_ascii=False))
print(f"Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges ({len(ast['nodes'])} AST + {len(sem['nodes'])} semantic)")

# Step 4 - Build, cluster, analyze
print("\n=== BUILD + CLUSTER + ANALYZE ===")
G = build_from_json(merged)
print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': merged.get('input_tokens', 0), 'output': merged.get('output_tokens', 0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
labels = {cid: f'Community {cid}' for cid in communities}
questions = suggest_questions(G, communities, labels)

report = generate(G, communities, cohesion, labels, gods, surprises, result, tokens, '.', suggested_questions=questions)
open('graphify-out/GRAPH_REPORT.md', 'w').write(report)
to_json(G, communities, 'graphify-out/graph.json')

analysis = {
    'communities': {str(k): v for k, v in communities.items()},
    'cohesion': {str(k): v for k, v in cohesion.items()},
    'gods': gods, 'surprises': surprises, 'questions': questions,
}
open('graphify-out/.graphify_analysis.json', 'w').write(json.dumps(analysis, indent=2, ensure_ascii=False))

# Step 5 - Label communities
print("\n=== LABELING ===")
community_files = {cid: [] for cid in communities}
for nid, attr in G.nodes(data=True):
    cid = attr.get('community')
    if cid is not None:
        community_files[cid].append(attr.get('label', nid))

# Generate names from top labels in each community
labels = {}
for cid, files in community_files.items():
    top = sorted(files, key=lambda x: len(x))[:5] if files else ['unnamed']
    labels[cid] = ', '.join(top[:3]) if len(top) <= 3 else f"{top[0]}, {top[1]}, +{len(top)-2} more"

questions = suggest_questions(G, communities, labels)
report = generate(G, communities, cohesion, labels, gods, surprises, result, tokens, '.', suggested_questions=questions)
open('graphify-out/GRAPH_REPORT.md', 'w').write(report)
open('graphify-out/.graphify_labels.json', 'w').write(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False))
print(f"Labeled {len(labels)} communities")

# Step 9 - Cleanup
print("\n=== CLEANUP ===")
for f in glob.glob('graphify-out/.graphify_chunk_*.json'):
    Path(f).unlink()
for f in ['.graphify_detect.json', '.graphify_extract.json', '.graphify_ast.json', '.graphify_semantic.json', '.graphify_analysis.json']:
    p = Path(f'graphify-out/{f}')
    if p.exists(): p.unlink()

from graphify.detect import save_manifest
save_manifest(result['files'])

# Update cost
from datetime import datetime, timezone
cost_path = Path('graphify-out/cost.json')
if cost_path.exists():
    cost = json.loads(cost_path.read_text())
else:
    cost = {'runs': [], 'total_input_tokens': 0, 'total_output_tokens': 0}
cost['runs'].append({
    'date': datetime.now(timezone.utc).isoformat(),
    'input_tokens': merged.get('input_tokens', 0),
    'output_tokens': merged.get('output_tokens', 0),
    'files': total,
})
cost['total_input_tokens'] += merged.get('input_tokens', 0)
cost['total_output_tokens'] += merged.get('output_tokens', 0)
cost_path.write_text(json.dumps(cost, indent=2, ensure_ascii=False))

print(f"\nDone. {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")
print(f"This run: {merged.get('input_tokens', 0):,} in / {merged.get('output_tokens', 0):,} out tokens")
print(f"All time: {cost['total_input_tokens']:,} in / {cost['total_output_tokens']:,} out ({len(cost['runs'])} runs)")
