/**
 * T台位置：球员数据字段 tPosition（BLUE_T | RED_T）
 * 创建时按性别默认赋值；记分页可修改；出发表 UI 只读此字段。
 *
 * resolve 优先级：tPosition > tee(兼容 BLUE_T/RED_T) > defaultFromGender(gender)
 */

const BLUE_T = 'BLUE_T';
const RED_T = 'RED_T';

function defaultFromGender(gender) {
  return gender === 'female' ? RED_T : BLUE_T;
}

function resolve(player) {
  if (!player) return BLUE_T;
  const tp = player.tPosition;
  if (tp === BLUE_T || tp === RED_T) return tp;
  const tee = player.tee;
  if (tee === BLUE_T || tee === RED_T) return tee;
  return defaultFromGender(player.gender);
}

function teeMarkerClass(tPosition) {
  return resolve({ tPosition }) === RED_T ? 'tee-marker-dot--female' : 'tee-marker-dot--male';
}

function enrichPlayer(player) {
  if (!player) return player;
  const tPosition = resolve(player);
  return Object.assign({}, player, {
    tPosition,
    teeMarkerClass: teeMarkerClass(tPosition)
  });
}

function normalizePlayer(player, playerId, genderFallback) {
  if (!player) return player;
  const playerDirectory = require('./playerDirectory');
  const gender = playerDirectory.getGenderById(playerId || player.playerId, player.gender || genderFallback);
  const tPosition = resolve({
    gender: gender,
    tPosition: player.tPosition,
    tee: player.tee
  });
  return Object.assign({}, player, { gender, tPosition });
}

module.exports = {
  BLUE_T,
  RED_T,
  defaultFromGender,
  resolve,
  teeMarkerClass,
  enrichPlayer,
  normalizePlayer
};
