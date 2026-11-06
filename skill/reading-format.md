# reading.json, format 1

Written by the skill beside a set's photos: `sets/<set-id>/reading.json`. Photo Ctrl shows it as plain lines, and outlines each line on its photo.

```json
{
  "format": 1,
  "set": "2026-11-05-1928-box",
  "kind": "Box",
  "read": "2026-11-05",
  "readBy": "Claude, WOODWERD photo skill 1",
  "status": "Read",
  "boxes": [
    {
      "position": 1,
      "boxId":      { "value": "WW-016", "sure": "Sure", "textRead": "PROPERTY OF WOODWERD · WW-016" },
      "label":      { "value": "ALLEN SOCKETS", "sure": "Sure", "textRead": "ALLEN SOCKETS" },
      "makerLabel": { "value": "SYS 1 CE-SORT", "sure": "Sure", "textRead": "SYS 1 CE-SORT (USA) No. 498796" },
      "kindOfBox":  { "value": "Sortainer", "sure": "Sure", "textRead": "sortainer T-Loc" },
      "model":      { "value": "sys-4-tl-sort-3", "sure": "Likely" },
      "match":      { "value": "WW-016", "sure": "Guess" },
      "where": [ { "photo": 1, "outline": [[0.05, 0.30], [0.95, 0.30], [0.95, 0.81], [0.05, 0.81]] } ],
      "drawers": [
        { "drawer": 3,
          "labels": [ { "value": "VISE GRIPS PRY BARS", "sure": "Sure", "textRead": "VISE GRIPS / PRY BARS" } ],
          "where": [ { "photo": 1, "outline": [[0.08, 0.64], [0.92, 0.64], [0.91, 0.79], [0.09, 0.79]] } ] }
      ],
      "items": [
        { "value": "CARVEX PS 420", "sure": "Likely", "textRead": "PS 420 EBQ-Plus USA", "catalog": true,
          "where": [ { "photo": 2, "outline": [[0.4, 0.5], [0.6, 0.5], [0.6, 0.7], [0.4, 0.7]] } ] }
      ],
      "note": "The Festool label names a drill set, so the box was reused."
    }
  ],
  "stands": { "on": { "value": "sys-cart", "sure": "Sure", "textRead": "FESTOOL SYS-CART" }, "where": [] },
  "notRead": ["The lid wasn't opened, so no tools were read."]
}
```

- `boxes`: one for a Box set; every box for a Stack, `position` 1 at the **bottom**; the box the set names for an Inside set.
- Every value is `{ value, sure, textRead? }`, `sure` one of `Sure`, `Likely`, `Guess`. Leave out what you didn't see.
- `model` uses a model ID from Tool Ctrl's `systainers.js`; a box that isn't a Systainer leaves it out and says what it is in `kindOfBox`.
- `match` is the record's box ID this box most likely is, if any.
- `where`: one entry per photo the thing shows in. `outline` is three or more `[x, y]` points, each 0 to 1 of the photo's width and height from its top left.
- `status`: `Read`, or `Nothing read` with `"reason"` and no `boxes`.
