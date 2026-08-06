function normalizeChangeCardRemaining(changeCard, customNum) {
  if (changeCard === false || changeCard == null || changeCard === "disabled") {
    return 0;
  }
  if (changeCard === "once") {
    return 1;
  }
  if (changeCard === "twice") {
    return 2;
  }
  if (changeCard === "unlimited" || changeCard === -1 || changeCard === "-1") {
    return Infinity;
  }
  if (changeCard === "custom") {
    const n2 = typeof customNum === "number" ? customNum : Number(customNum);
    if (!Number.isFinite(n2) || n2 <= 0) {
      return 0;
    }
    return Math.floor(n2);
  }
  const n = typeof changeCard === "number" ? changeCard : Number(changeCard);
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return Math.floor(n);
}
export {
  normalizeChangeCardRemaining
};
