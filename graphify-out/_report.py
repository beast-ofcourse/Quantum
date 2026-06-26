import json
d = json.load(open('graphify-out/.graphify_detect.json'))
print(f'Corpus: {d["total_files"]} files, ~{d["total_words"]} words')
for k, v in d['files'].items():
    if v:
        print(f'  {k}: {len(v)} files')
