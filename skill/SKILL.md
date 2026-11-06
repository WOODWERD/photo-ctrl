---
name: woodwerd-photo
description: Read tool box photos that Photo Ctrl sent to the person's private GitHub photo repo, write a reading beside each set, and write proposals for Tool Ctrl to review. Use when the person asks to read their new tool photos, their waiting sets, or their Photo Ctrl photos.
---

# WOODWERD photo skill

You are reading photos of tool boxes, stacks of boxes, and the inside of boxes or drawers, taken with [Photo Ctrl](https://woodwerd.github.io/photo-ctrl/). They sit in the person's own **private** GitHub repo. You write what you saw back beside the photos, and you write proposals for [Tool Ctrl](https://woodwerd.github.io/tool-ctrl/) that the person reviews there. Nothing you write changes their inventory; only the person does that, in Tool Ctrl.

This skill holds no one's data. It runs in the person's own Claude, with their own access to their own repos.

## What you need

- The **photo repo**, as `owner/name`. If the person hasn't said, look for a private repo whose `README.md` says "Photo Ctrl photos", or ask.
- The **data repo**: their Tool Ctrl repo, holding `tool-ctrl.json`. Ask if it isn't clear. Without one, write readings only and say proposals need it (PH-E09).
- GitHub access through the `gh` command, signed in. Work in a fresh clone of each repo in a temporary folder. Check `gh repo view <repo> --json isPrivate` first; **refuse to work on a public photo repo** and tell the person to make it private.

## Steps

1. **Find the waiting sets.** In the photo repo, every folder `sets/<set-id>/` without a `reading.json` is waiting. Read them oldest first. Say how many you found. If there are more than 20, ask before reading more than 20 (PH-R103).
2. **Load what to match against.** From the data repo, read `tool-ctrl.json` (the person's boxes, drawers and tools). From the public Tool Ctrl site, read `https://woodwerd.github.io/tool-ctrl/systainers.js` (box models and their IDs, such as `sys-2-tl`, `sys3-m-187`, `sys-4-tl-sort-3`) and `https://woodwerd.github.io/tool-ctrl/catalog.js` (tool names). Use these names, not your own (PH-R102, PH-R111).
3. **Read each set.** Open `set.json` (what it shows: Box, Stack or Inside; box IDs from QR codes; note; drawer) and look at every photo `1.jpg`, `2.jpg`… at full size. Ignore `thumb.jpg`. Zoom into labels: crop the region and look again when text is small. Read:
   - **Box**: the box ID from a QR code or the label's text (a Box Ctrl label reads "PROPERTY OF … · WW-001"); any old label's text, word for word; the maker's label and its part number; the kind of box and its model, from the maker's label, the markings moulded on the box ("systainer T-Loc", "systainer³", "sortainer T-Loc") and its proportions; drawers and their labels; and any tools you can see (PH-R104).
   - **Stack**: each box from **bottom to top**, as for a Box; which box in the record it most likely is; and what the stack stands on, such as a SYS-CART (PH-R105). Photos of one tall stack overlap; a box seen in two photos is one box.
   - **Inside**: the tools and items you can see, for the box and drawer the set names (PH-R106).
4. **Say how sure you are.** Every value is `Sure`, `Likely` or `Guess` (PH-R107):
   - Sure: read plainly from a QR code or printed text, or matched exactly.
   - Likely: read clearly but matched by name or shape.
   - Guess: anything less. A model is never Sure from shape alone. A box in a stack with no readable label is never Sure.
   Where a value came from words, keep the words read in `textRead`.
5. **Outline what you read.** For every box, drawer and tool, record where it is in each photo it shows in: the photo's number and an outline traced around it, as points in **fractions of the photo's width and height** (0 to 1, from the top left). Trace the shape where you can; otherwise give the four corners of the box around it. Something you inferred but can't place gets no outline (PH-R115). Check each outline by drawing it on the photo before you write it; it should sit on the edges of the thing, not on its neighbour.
6. **Write `reading.json`** beside the photos, in the format in `reading-format.md`. A set you can't read (blurred, dark, nothing there) gets `"status": "Nothing read"` and a `reason`, and no proposal (PH-R113). Commit every reading in **one commit** to the photo repo, such as "Read 12 sets", and push (PH-R108).
7. **Write proposals.** For each set read, write `proposals/<set-id>.json` in the data repo, in the format in `proposal-format.md`, and commit them all in **one commit**, such as "Proposals from 12 sets", and push (PH-R109).
8. **Report.** Say in chat how many sets you read; how many new boxes, models, tools and stacks you proposed; what you couldn't read and why. Then: open Tool Ctrl on a computer or iPad to review (PH-R112).

## Never

- Never edit `tool-ctrl.json` or anything in the data repo other than `proposals/`.
- Never give a box a number. A box you can't match is a **new box**; Tool Ctrl numbers it when the person adds it (PH-R110). Carry an old label's number in the proposal, so Tool Ctrl can offer to keep it.
- Never add specifications or descriptions to tool names. Name tools as the catalog names them, or as written on the tool.
- Never send a photo, a reading or a token anywhere but the person's own repos. Never post them to WOODWERD.
- Never work on a public photo repo.

## Running again

Only sets with no `reading.json` are read. If the person deletes a set's `reading.json`, read it again; replace its proposal if that proposal is still `Waiting` (PH-R114).
