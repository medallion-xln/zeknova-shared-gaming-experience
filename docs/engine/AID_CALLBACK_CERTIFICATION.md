# Aid callback certification — ZGE-06

**Observed contract certified; successful aid benefit application remains unresolved and LEGACY-owned.** No semantics were invented from the callback name, no production patch was applied and no aid command was added to staging's example catalog.

Artifact `assets/index-02987539.js` contains exactly three `applyZeknovanAidProject` occurrences: capturing `zR.prototype.applyZeknovanAidProject` into `zkApplyAidProject`, assigning the wrapper, and the initialize callback invoking it. No earlier definition exists in this artifact or other current readable modules. The extracted reconstruction repeats that same wrapper; it does not recover a missing implementation. ZGE-05's finding is confirmed, rather than interpreted as a license to implement guessed trust/reward benefits.

Actual invocation order: base placement deducts/builds; progression wrapper notifies personal build objective; aid wrapper marks `beneficiary='zeknovan'` and `aidProject`; callback calls game.applyZeknovanAidProject. The latter returns early for null record/project or existing `aidEffectAppliedAt`. Otherwise it calls beginZeknovanAidCooldown, then `zkApplyAidProject.call`. With the absent captured implementation, that final call throws after earlier writes. Pointer campaign/XP/final save effects may therefore never run, while the record/cost/cooldown already changed. Later autosave/network is not a compensating transaction.

Actual cooldown: absolute project tension magnitude; minutes = clamp(3 + round((abs(tension) − 10) × 0.7), 3, 10); milliseconds = minutes × 60,000. Global cooldown is max(previous, Date.now + duration); the record stores duration/global expiry. No numeric aid benefit follows successfully in this artifact without an external replacement.

`aid-contract.test.mjs` executes the actual cooldown, early-return, tagging and effect wrapper bodies with controlled time, verifies 3/10 minute bounds and global maximum, and proves record tags/cooldown precede the missing-method exception. Earlier actual-code pointer/model-failure, progression persistence and 702/390 manager tests remain intact. Test fixture stubs for addRecord/progression do not certify live benefits, every project animation/acoustic effect or a fully integrated aid transaction.

Integration blocker: recover the original base callback/source and its trust/tension/indicators/mission/save/network/reward contract, or separately authorize and specify a new game policy. Then test exact accepted/rejected/duplicate/cooldown/restore effects through the complete source command port with an explicit clock and durable receipt. Keep the current live writer in place until that is done. This known pre-existing defect remains distinct from new runtime/server regressions.


## ZGE-07 update

ZGE-07 repeated the actual artifact search: exactly three occurrences, unchanged artifact hash, no recovered base benefit definition. Actual extracted-body tests still pass. ConstructionPort rejects aid metadata/actions before spending, and the HTTP catalog/allowlist excludes them. This quarantines the independent domain; it does not repair or certify the live callback. See evidence/zge07/aid-investigation.json and CONSTRUCTION_COVERAGE_ZGE_07.md.
