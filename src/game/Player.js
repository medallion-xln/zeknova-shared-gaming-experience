export const RANK_PROGRESSION = Object.freeze({
  ensign: { label: "Ensign", next: "lieutenant", missions: 4, personalGoals: 4, miningCooldown: 10 },
  lieutenant: { label: "Lieutenant", next: "captain", missions: 8, personalGoals: 8, miningCooldown: 5 },
  captain: { label: "Captain", next: null, missions: 12, personalGoals: 12, miningCooldown: 2 },
});

export function rankGoal(rank = "ensign") {
  const profile = RANK_PROGRESSION[rank] ?? RANK_PROGRESSION.ensign;
  if (!profile.next) return null;
  const next = RANK_PROGRESSION[profile.next];
  return { rank: profile.next, label: next.label.toUpperCase(), missions: profile.missions, personal: profile.personalGoals, personalGoals: profile.personalGoals };
}

export function miningCooldown(rank = "ensign") {
  return (RANK_PROGRESSION[rank] ?? RANK_PROGRESSION.ensign).miningCooldown;
}
