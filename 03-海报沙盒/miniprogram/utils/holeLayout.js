const HOLE_PARS = [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4];

function resolveLayoutFromContext() {
  return { holePars: HOLE_PARS.slice() };
}

function getLayout() {
  return {
    holePars: HOLE_PARS.slice(),
    columnPars: []
  };
}

module.exports = {
  resolveLayoutFromContext,
  getLayout
};
