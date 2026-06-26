import json, os, glob, sys
from pathlib import Path

gemini_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
print(f'Gemini key set: {bool(gemini_key)}')

from graphify.cache import check_semantic_cache, save_semantic_cache
from graphify.detect import detect

result = detect(Path('.'))
doc_files = result['files'].get('document', [])
img_files = result['files'].get('image', [])
all_uncached = doc_files + img_files
print(f'Docs+images: {len(all_uncached)} files')

cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(all_uncached)
print(f'Cached: {len(all_uncached) - len(uncached)} hit, {len(uncached)} need extraction')

all_nodes, all_edges, all_hyperedges = list(cached_nodes), list(cached_edges), list(cached_hyperedges)

if uncached:
    uncached_paths = [Path(f) for f in uncached]
    if gemini_key:
        print('Using Gemini for semantic extraction...')
        from graphify.llm import extract_corpus_parallel
        semantic = extract_corpus_parallel(uncached_paths, backend='gemini')
        print(f'Semantic: {len(semantic.get("nodes",[]))} nodes, {len(semantic.get("edges",[]))} edges')
    else:
        print('No Gemini key - using filename-level extraction')
        semantic = {'nodes': [], 'edges': [], 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}
        seen = set()
        for f in uncached_paths:
            nid = f'file:{f}'
            if nid not in seen:
                seen.add(nid)
                semantic['nodes'].append({
                    'id': nid, 'type': 'file', 'label': f.stem,
                    'metadata': {'path': str(f), 'source_location': str(f)},
                    'evidence': 'EXTRACTED'
                })
        print(f'Generated {len(semantic["nodes"])} basic file nodes')

    if semantic.get('nodes'):
        save_semantic_cache(semantic['nodes'], semantic.get('edges', []), semantic.get('hyperedges', []))
        existing_ids = {n['id'] for n in all_nodes}
        for n in semantic.get('nodes', []):
            if n['id'] not in existing_ids:
                all_nodes.append(n)
                existing_ids.add(n['id'])
        all_edges.extend(semantic.get('edges', []))
        all_hyperedges.extend(semantic.get('hyperedges', []))

semantic_result = {
    'nodes': all_nodes, 'edges': all_edges,
    'hyperedges': all_hyperedges,
    'input_tokens': 0, 'output_tokens': 0,
}
open('graphify-out/.graphify_semantic.json', 'w').write(json.dumps(semantic_result, indent=2, ensure_ascii=False))
print(f'Semantic total: {len(all_nodes)} nodes, {len(all_edges)} edges')

# Merge
print()
print('=== MERGE ===')
ast = json.load(open('graphify-out/.graphify_ast.json'))
seen = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in semantic_result['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])
merged_edges = ast['edges'] + semantic_result['edges']
merged = {
    'nodes': merged_nodes, 'edges': merged_edges,
    'hyperedges': semantic_result.get('hyperedges', []),
    'input_tokens': 0, 'output_tokens': 0,
}
open('graphify-out/.graphify_extract.json', 'w').write(json.dumps(merged, indent=2, ensure_ascii=False))
print(f'Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges')

# Build + cluster + analyze
print()
print('=== BUILD + CLUSTER ===')
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

G = build_from_json(merged)
print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges')

if G.number_of_nodes() > 0:
    communities = cluster(G)
    cohesion = score_all(G, communities)
    tokens = {'input': 0, 'output': 0}
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)

    community_files = {cid: [] for cid in communities}
    for nid, attr in G.nodes(data=True):
        cid = attr.get('community')
        if cid is not None:
            community_files[cid].append(str(attr.get('label', nid))[:40])

    labels = {}
    for cid, files in community_files.items():
        top = sorted(set(files), key=lambda x: len(x))[:5] if files else ['unnamed']
        labels[cid] = ', '.join(top[:3]) if len(top) <= 3 else f'{top[0]}, {top[1]}, +{len(top)-2} more'

    questions = suggest_questions(G, communities, labels)
    report = generate(G, communities, cohesion, labels, gods, surprises, result, tokens, '.', suggested_questions=questions)
    open('graphify-out/GRAPH_REPORT.md', 'w').write(report)
    to_json(G, communities, 'graphify-out/graph.json')

    open('graphify-out/.graphify_labels.json', 'w').write(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False))
    print(f'Labeled {len(labels)} communities')

    print()
    print('=== GOD NODES ===')
    for g in gods[:10]:
        print(f'  {g["id"]} (bridge: {g.get("bridge_score",0):.2f})')

    print()
    print('=== COMMUNITIES ===')
    for cid, name in sorted(labels.items()):
        print(f'  C{cid}: {name} ({len(community_files[cid])} nodes)')

    print()
    print('=== SURPRISING CONNECTIONS ===')
    for s in surprises[:5]:
        print(f'  {s["source"]} <-> {s["target"]}')

    print()
    print('=== SUGGESTED QUESTIONS ===')
    for q in questions[:5]:
        print(f'  {q}')

# Cleanup
print()
print('=== CLEANUP ===')
for f in ['.graphify_detect.json', '.graphify_extract.json',
          '.graphify_ast.json', '.graphify_semantic.json']:
    p = Path(f'graphify-out/{f}')
    if p.exists(): p.unlink()

from graphify.detect import save_manifest
save_manifest(result['files'])

from datetime import datetime, timezone
cost_path = Path('graphify-out/cost.json')
if cost_path.exists():
    cost = json.loads(cost_path.read_text())
else:
    cost = {'runs': [], 'total_input_tokens': 0, 'total_output_tokens': 0}
cost['runs'].append({
    'date': datetime.now(timezone.utc).isoformat(),
    'input_tokens': 0, 'output_tokens': 0,
    'files': result.get('total_files', 0),
})
cost_path.write_text(json.dumps(cost, indent=2, ensure_ascii=False))

print(f'\nDone. {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
print('Outputs in graphify-out/')
