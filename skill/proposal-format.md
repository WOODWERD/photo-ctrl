# Proposal files, format 1

Written by the skill to the person's Tool Ctrl data repo: `proposals/<set-id>.json`. Tool Ctrl's From photos review and Stack Ctrl's Proposed stacks read them. The skill never edits `tool-ctrl.json` (PH-R90 to PH-R93).

```json
{
  "format": 1,
  "set": "2026-11-05-1928-stack-2",
  "photoRepo": "you/tool-photos",
  "shows": "Stack",
  "read": "2026-11-05",
  "status": "Waiting",
  "changes": [
    { "type": "newBox", "ref": "n1",
      "name":  { "value": "XL DOMINOS", "sure": "Sure", "textRead": "XL DOMINOS" },
      "kindOfBox": { "value": "Systainer", "sure": "Sure", "textRead": "systainer T-Loc" },
      "model": { "value": "sys-1-tl", "sure": "Likely" },
      "oldLabel": { "text": "XL DOMINOS", "number": null },
      "notes": "Festool label: DS/XL-D12/D14 128 BU, No. 498205",
      "where": [ { "photo": 1, "outline": [[0.05, 0.74], [0.96, 0.74], [0.95, 0.90], [0.06, 0.90]] } ] },
    { "type": "model", "box": "WW-001",
      "model": { "value": "sys-2-tl", "sure": "Likely" }, "where": [] },
    { "type": "items", "box": "WW-001", "drawer": null,
      "items": [ { "name": { "value": "DOMINO DF 500", "sure": "Likely", "textRead": "DF 500 Q-Plus USA" },
                   "brand": "Festool", "kind": "Joiner", "tier": "Power", "quantity": 1, "catalog": true, "where": [] } ] },
    { "type": "stack", "on": { "value": null, "sure": "Guess" },
      "boxes": [ { "ref": "n1", "sure": "Likely" }, { "ref": "n2", "sure": "Likely" }, { "box": "WW-001", "sure": "Sure" } ] }
  ]
}
```

- `type`: `newBox`, `model`, `items` or `stack`.
- A new box has a `ref` (`n1`, `n2`…) so a stack or an `items` change in the same file can name it before it has a number. Tool Ctrl numbers it on add and writes `"added": { "n1": "WW-017" }` into the file, which Stack Ctrl reads.
- An `items` change names its box by `box` (an ID in the record) or, for a new box in this file, `"box": null` and `ref`.
- A `model` change for a box you matched by likeness carries `match` with how sure the match is; a guessed match leaves the change unticked in Tool Ctrl.
- A new box is ticked in Tool Ctrl by how sure its `name` is. A guessed `model` is shown but not set.
- `oldLabel.number` carries a number from an old label, such as `WW-031` or `ST-014`, for Tool Ctrl to offer to keep or note.
- A stack lists boxes **bottom to top**, each by `box` (an ID in the record) or `ref` (a new box in this file).
- `status` is `Waiting` until reviewed. Tool Ctrl or Stack Ctrl writes `Accepted`, `Partly accepted` or `Declined` with `reviewed` (a date). The file stays as the record of what was proposed.
- `where` carries the outlines from the reading, so the reviews can show them.
- A `stack` change gets its own `status` (`Accepted` or `Declined`), `reviewed` and `stacked` (the box IDs as stacked) from Stack Ctrl, since Tool Ctrl's status covers the file as a whole.
