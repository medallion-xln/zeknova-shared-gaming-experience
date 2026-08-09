# ZekNova gameplay QA states

These deterministic states are available only on `localhost`, `127.0.0.1`, or `::1`. They never write campaign progress, rewards, resources, or rank changes to the shared save.

Use `?demo=1&mission=N` to begin mission `N` with all earlier missions complete. Use `?demo=1&boss=N` to begin the corresponding boss battle with the mission's first four objectives complete.

If a copied QA URL contains both parameters, `boss=N` takes priority. Extra leading question marks are normalized as well, although the canonical links below use a single `?`.

| # | Rank | Biome | Mission state | Boss state |
|---:|---|---|---|---|
| 1 | Ensign | Desert | [Power the landing zone](http://127.0.0.1:8790/?demo=1&mission=1) | [The Sunscar Colossus](http://127.0.0.1:8790/?demo=1&boss=1) |
| 2 | Ensign | Wetlands | [Secure freshwater](http://127.0.0.1:8790/?demo=1&mission=2) | [The Mire Siren](http://127.0.0.1:8790/?demo=1&boss=2) |
| 3 | Ensign | Forest | [Open the command post](http://127.0.0.1:8790/?demo=1&mission=3) | [The Ancient Thornwarden](http://127.0.0.1:8790/?demo=1&boss=3) |
| 4 | Ensign | Highlands | [Raise the first defense tower](http://127.0.0.1:8790/?demo=1&mission=4) | [The Stormback](http://127.0.0.1:8790/?demo=1&boss=4) |
| 5 | Lieutenant | Arctic | [Form a defensive crossfire](http://127.0.0.1:8790/?demo=1&mission=5) | [The White Screecher](http://127.0.0.1:8790/?demo=1&boss=5) |
| 6 | Lieutenant | Wetlands | [Protect the supply route](http://127.0.0.1:8790/?demo=1&mission=6) | [The Drowned Tremor](http://127.0.0.1:8790/?demo=1&boss=6) |
| 7 | Lieutenant | Arctic | [Activate mission intelligence](http://127.0.0.1:8790/?demo=1&mission=7) | [The Archive Shade](http://127.0.0.1:8790/?demo=1&boss=7) |
| 8 | Lieutenant | Forest | [Establish crew morale](http://127.0.0.1:8790/?demo=1&mission=8) | [The Spore Cantor](http://127.0.0.1:8790/?demo=1&boss=8) |
| 9 | Captain | Desert | [Commission local command](http://127.0.0.1:8790/?demo=1&mission=9) | [The Cinder Scrapper](http://127.0.0.1:8790/?demo=1&boss=9) |
| 10 | Captain | Wetlands | [Expand the garrison](http://127.0.0.1:8790/?demo=1&mission=10) | [The Broodwarden](http://127.0.0.1:8790/?demo=1&boss=10) |
| 11 | Captain | Highlands | [Unlock advanced missions](http://127.0.0.1:8790/?demo=1&mission=11) | [The Arc Gunner](http://127.0.0.1:8790/?demo=1&boss=11) |
| 12 | Captain | Forest | [Complete the defense grid](http://127.0.0.1:8790/?demo=1&mission=12) | [The Rootbound Tremor](http://127.0.0.1:8790/?demo=1&boss=12) |

Equivalent aliases are available as `?demo=1&state=mission-N` and `?demo=1&state=boss-N`.

Every state provides stable resources, full health and stamina, the campaign-appropriate rank, a compact on-screen QA label, and a machine-readable snapshot in `[data-qa-gameplay-state]`. In the console, `ZekNovaGameplayState.snapshot()` returns the same current state.

Boss states keep player damage enabled. This makes them suitable for measuring encounter performance, effects, pathfinding, hit detection, health UI, and cleanup behavior rather than merely displaying the boss model.
