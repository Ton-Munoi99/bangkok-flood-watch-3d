# Data video (data-video-studio skill)

A short vertical video brief (Thai or English) built from the live site. Every number comes from the same
fetchers and parsers the map uses; nothing is typed in.

Files kept in git: `build_data.ts` (live feeds → `data.js`), `make_script.py` (`data.js` → narration script),
`studio/scenes.js` (the scenes, both languages) and `studio/viz-gate.md` (the dataviz checklist).
Everything else (copied studio assets, voice, renders) is regenerated.

```bash
SK=<data-video-studio skill dir>/scripts; DV=<dataviz skill dir>; L=en   # or th
DVS_LANGS=$L bash $SK/setup.sh                                           # once: voices + renderer
mkdir -p video/out/$L video/studio_$L && cp -r $SK/../assets/studio/. video/studio_$L/ && cp video/studio/{scenes.js,viz-gate.md} video/studio_$L/
echo "window.LANG='$L';" > video/studio_$L/lang.js
node video/build_data.ts video/studio_$L/data.js
python3 video/make_script.py video/studio_$L/data.js video/out/$L/script.json $SK $L
python3 $SK/tts.py video/out/$L/script.json video/out/$L/vo && cp video/out/$L/vo/timing.js video/studio_$L/
python3 $SK/asr_check.py video/out/$L/vo          # Thai: a rough check only — have a person listen
python3 $SK/gate_check.py video/studio_$L --dataviz $DV
node $SK/render.js video/studio_$L video/out/$L/silent.mp4 && bash $SK/mix.sh video/out/$L/vo video/out/$L/silent.mp4 video/out/brief-$L.mp4
```

Voices: English = Kokoro (Apache-2.0). Thai = MMS (CC-BY-NC, **not for commercial use**); a commercial Thai voice
needs a Google Cloud or Azure key set in your own environment.
