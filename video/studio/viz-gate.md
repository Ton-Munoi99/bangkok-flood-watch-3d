# viz-gate — Bangkok Flood Watch 3D, English brief (2026-10-11)

dataviz skill loaded from: /private/tmp/claude-501/bundled-skills/2.1.295/dfeeb9f3344b501ad0d42bd94633a54e/dataviz

## Per scene: data job → form
| scene | what it shows | form chosen | kit component | colour job |
|---|---|---|---|---|
| s1 | title, date of the data | text | el | ink + chrome chip |
| s2 | road sensors showing water; severe count; deepest point | KPI stat tiles + text card (single numbers, not a chart) | statTile, el | ink only |
| s3 | canal gauges over bank (count); gauges near bank (state) | stat tile + status list | statTile, status | status warning = near bank, icon + label |
| s4 | river gauges over bank, how far over; Samsen margin | bar list, one series, status flag on label; stat tile | barList, statTile, status | --series-1; critical flag = over bank |
| s5 | each dam's fill vs capacity; dam release | bar list with 100% reference line, status flag when full; stat tile | barList(refLine), statTile, status | --series-1; warning flag = full |
| s6 | over-bank gauges by province, top 5 | bar list, one series (magnitude) | barList | --series-1 |
| s7 | flooded highway sections; impassable; by province | stat tile + status card + bar list, one series | statTile, status, barList | --series-1; critical = impassable |
| s8 | end card, sources | text | el | ink |

## Checklist
- [x] Loaded the dataviz skill this session and read the references for every form used
- [x] Each chart scene's form was chosen from the data's job (table above), not from looks
- [x] Every data colour is a palette.css token; validator results below are from this palette
- [x] Each entity keeps one series slot for the whole video (listed: all bars are one series, --series-1)
- [x] Text uses ink tokens; identity shown by swatch/icon, never coloured text
- [x] Status colours only for state, each with icon + label
- [x] ≥ 2 series have a legend; single-series charts have none and the title names them
- [x] Every number on screen comes from data.js (no typed-in values); sources + dates shown
- [x] Rendered stills of every scene and looked at them: no clipping, collisions, or overflow

## Validator output (paste)
```
(see gate_check.py run)
```
