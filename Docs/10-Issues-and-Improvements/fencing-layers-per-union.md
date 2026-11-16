# Prepare stored Felzenszwalb layers for each union's area

**Date:** 2026-11-16
**Severity:** Improvement (speed and neighbours of border jobs)
**Repo:** nila-sensing (compute/fencing/layers.py), node beat
**Status:** Todo, not built (executive decision, 16 Nov)

## What
Stored layers (nila-sensing `t1/sensing/stored-layers`) turn a border point inside a prepared block into a lookup:
about 3 s after the NDVI fetch, instead of a full fencing run, and with every field-size neighbour around it. On the
demo there is one 1 x 1 km block, prepared by hand. Points outside any block still run live.

## What needs to change
- When a union is admitted, the node prepares the layers for its area: the union's centre and its maximum radius.
  The max radius from the union centre is already in the contract. I couldn't find it in nila-soroban
  `roles`; FoodToken has an `isWithinLogisticsRange` flag. Find where the centre and radius live first.
- **Size:** a 5 km radius is a 10 x 10 km square, about 100 km². At the 16 Nov test rates (1 km² ≈ 10 min on 8 cores,
  590 MB of label rasters, 13.6 MB as compressed vectors):
  - building takes about 17 hours on 8 cores;
  - the label rasters would be about 59 GB, so store vectors (about 1.4 GB) and rasterise the window at lookup;
  - fetching takes about 4,400 Esri z18 tiles, once.
- Prepare in blocks (e.g. 1 km), the members' fields first, so a union's first jobs get the lookup early.
- Refresh when the imagery changes (Esri's date per tile).
- Licence: Esri World Imagery only (its terms allow tracing into vector data; Google and Mapbox do not without a
  licence). Check Esri's own "Data Collection and Editing" terms before production.

## Related
- Test images and timings: session of 16 Nov; PR on nila-sensing `t1/sensing/stored-layers`.
