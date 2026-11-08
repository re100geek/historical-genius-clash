/* HGC Tag Team v14.3.4 - 2v2 shared deterministic rules, no changes to combat damage. */
(function (root, factory) {
  'use strict';
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  if (root) root.HGCTagTeamRules = rules;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const TAG_COOLDOWN_FRAMES = 180;
  function validateTeams(teams, rosterCount) {
    if (!Array.isArray(teams) || teams.length !== 2 || !Number.isInteger(rosterCount) || rosterCount < 2) return false;
    return teams.every(team => Array.isArray(team) && team.length === 2 && team.every(id =>
      Number.isInteger(id) && id >= 0 && id < rosterCount) && team[0] !== team[1]);
  }
  function createTeam(main, backup) {
    if (!main || !backup || main === backup) throw new Error('각 팀은 서로 다른 전투 캐릭터 두 명을 선택해야 합니다.');
    return { members: [main, backup], activeIndex: 0, lastTagFrame: -TAG_COOLDOWN_FRAMES };
  }
  function nextAvailable(team) {
    if (!team || !Array.isArray(team.members)) return -1;
    const candidate = 1 - team.activeIndex;
    return team.members[candidate] && team.members[candidate].hp > 0 ? candidate : -1;
  }
  function canTag(team, currentFrame, forced) {
    if (nextAvailable(team) < 0) return false;
    if (forced) return true;
    const active = team.members[team.activeIndex];
    return active && active.hp > 0 && active.hitStun <= 0 && active.attack <= 0 && active.ult <= 0 &&
      active.ground && currentFrame - team.lastTagFrame >= TAG_COOLDOWN_FRAMES;
  }
  function swap(team, currentFrame, forced) {
    if (!canTag(team, currentFrame, forced)) return null;
    const outgoing = team.members[team.activeIndex];
    team.activeIndex = nextAvailable(team);
    team.lastTagFrame = currentFrame;
    return {outgoing, incoming: team.members[team.activeIndex]};
  }
  function hasFighters(team) { return Boolean(team && team.members.some(member => member && member.hp > 0)); }
  function teamHealthRatio(team) {
    if (!team || !Array.isArray(team.members)) return 0;
    return team.members.reduce((sum, member) => {
      if (!member || !(member.maxHp > 0)) return sum;
      return sum + Math.max(0, Math.min(1, member.hp / member.maxHp));
    }, 0);
  }
  return Object.freeze({TAG_COOLDOWN_FRAMES, validateTeams, createTeam, nextAvailable, canTag, swap, hasFighters, teamHealthRatio});
});
