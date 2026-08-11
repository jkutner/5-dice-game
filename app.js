const CATEGORIES = [
  { id: "ones", label: "Ones", section: "upper", detail: "Count all ones" },
  { id: "twos", label: "Twos", section: "upper", detail: "Count all twos" },
  { id: "threes", label: "Threes", section: "upper", detail: "Count all threes" },
  { id: "fours", label: "Fours", section: "upper", detail: "Count all fours" },
  { id: "fives", label: "Fives", section: "upper", detail: "Count all fives" },
  { id: "sixes", label: "Sixes", section: "upper", detail: "Count all sixes" },
  { id: "threeKind", label: "Three of a kind", section: "lower", detail: "Total of all dice" },
  { id: "fourKind", label: "Four of a kind", section: "lower", detail: "Total of all dice" },
  { id: "fullHouse", label: "Full house", section: "lower", detail: "Three plus two" },
  { id: "smallStraight", label: "Small straight", section: "lower", detail: "Four in a row" },
  { id: "largeStraight", label: "Large straight", section: "lower", detail: "Five in a row" },
  { id: "yahtzee", label: "Yahtzee", section: "lower", detail: "Five of a kind" },
  { id: "chance", label: "Chance", section: "lower", detail: "Total of all dice" }
];

const UPPER_IDS = CATEGORIES.filter((category) => category.section === "upper").map((category) => category.id);
const LEGACY_GAME_VERSION = 1;
const COMPACT_GAME_VERSION = 2;
const PIP_POSITIONS = {
  1: [4], 2: [1, 7], 3: [1, 4, 7], 4: [1, 2, 6, 7],
  5: [1, 2, 4, 6, 7], 6: [1, 2, 3, 5, 6, 7]
};

const state = {
  players: [createPlayer("Player One"), createPlayer("Player Two")],
  activePlayer: 0,
  viewedPlayer: 0,
  dice: [1, 2, 3, 4, 5],
  held: [false, false, false, false, false],
  rollsLeft: 3,
  hasRolled: false,
  rolling: false,
  history: [],
  handoffPending: false
};

let pendingCategoryId = null;

const elements = {
  diceTray: document.querySelector("#dice-tray"),
  activePlayer: document.querySelector("#active-player"),
  rollsLeft: document.querySelector("#rolls-left"),
  holdHint: document.querySelector("#hold-hint"),
  rollButton: document.querySelector("#roll-button"),
  rollLabel: document.querySelector("#roll-label"),
  scoreOptions: document.querySelector("#score-options"),
  scoreNote: document.querySelector("#score-note"),
  scorecard: document.querySelector("#scorecard"),
  gameOver: document.querySelector("#game-over"),
  winnerTitle: document.querySelector("#winner-title"),
  winnerCopy: document.querySelector("#winner-copy"),
  finalScores: document.querySelector("#final-scores"),
  handoffDialog: document.querySelector("#handoff-dialog"),
  nextPlayer: document.querySelector("#next-player"),
  shareLink: document.querySelector("#share-link"),
  copyStatus: document.querySelector("#copy-status"),
  invalidGame: document.querySelector("#invalid-game"),
  turnSummary: document.querySelector("#turn-summary"),
  previousPlayer: document.querySelector("#previous-player"),
  summaryDice: document.querySelector("#summary-dice"),
  previousCategory: document.querySelector("#previous-category"),
  previousScore: document.querySelector("#previous-score"),
  continueCopy: document.querySelector("#continue-copy"),
  scoreConfirmation: document.querySelector("#score-confirmation"),
  confirmCategory: document.querySelector("#confirm-category"),
  confirmScore: document.querySelector("#confirm-score"),
  returnToHandoff: document.querySelector("#return-to-handoff")
};

function createPlayer(name) {
  return { name, scores: Object.fromEntries(CATEGORIES.map((category) => [category.id, null])) };
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function checksum(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest)).slice(0, 16);
}

function writeBits(bytes, position, value, length) {
  for (let bit = length - 1; bit >= 0; bit--) {
    const byteIndex = Math.floor(position / 8);
    bytes[byteIndex] |= ((value >> bit) & 1) << (7 - (position % 8));
    position++;
  }
  return position;
}

function readBits(bytes, position, length) {
  let value = 0;
  for (let bit = 0; bit < length; bit++) {
    value = (value << 1) | ((bytes[Math.floor(position / 8)] >> (7 - (position % 8))) & 1);
    position++;
  }
  return { value, position };
}

function encodeCompactGame() {
  const bytes = new Uint8Array(Math.ceil((8 + state.history.length * 17) / 8));
  let position = 0;
  position = writeBits(bytes, position, COMPACT_GAME_VERSION, 3);
  position = writeBits(bytes, position, state.history.length, 5);

  state.history.forEach(([, categoryIndex, dice]) => {
    const diceCode = dice.reduce((value, die) => value * 6 + die - 1, 0);
    position = writeBits(bytes, position, categoryIndex, 4);
    position = writeBits(bytes, position, diceCode, 13);
  });
  return bytesToBase64Url(bytes);
}

async function createGameUrl() {
  const payload = encodeCompactGame();
  const signature = await checksum(payload);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("game", `${payload}.${signature}`);
  return url.toString();
}

function decodeCompactGame(bytes) {
  let position = 0;
  let result = readBits(bytes, position, 3);
  const version = result.value;
  position = result.position;
  result = readBits(bytes, position, 5);
  const turnCount = result.value;
  position = result.position;

  if (version !== COMPACT_GAME_VERSION || turnCount > CATEGORIES.length * 2 || bytes.length !== Math.ceil((8 + turnCount * 17) / 8)) {
    throw new Error("Invalid compact game header");
  }

  const scores = [Array(CATEGORIES.length).fill(null), Array(CATEGORIES.length).fill(null)];
  const history = [];
  for (let turn = 0; turn < turnCount; turn++) {
    result = readBits(bytes, position, 4);
    const categoryIndex = result.value;
    position = result.position;
    result = readBits(bytes, position, 13);
    let diceCode = result.value;
    position = result.position;
    const player = turn % 2;

    if (!CATEGORIES[categoryIndex] || diceCode >= 6 ** 5 || scores[player][categoryIndex] !== null) {
      throw new Error("Invalid compact turn");
    }

    const dice = Array(5);
    for (let index = dice.length - 1; index >= 0; index--) {
      dice[index] = (diceCode % 6) + 1;
      diceCode = Math.floor(diceCode / 6);
    }
    const score = scoreDice(CATEGORIES[categoryIndex].id, dice);
    scores[player][categoryIndex] = score;
    history.push([player, categoryIndex, dice, score]);
  }
  return { activePlayer: turnCount % 2, scores, history };
}

function decodeLegacyGame(bytes) {
  const game = JSON.parse(new TextDecoder().decode(bytes));
  if (game.v !== LEGACY_GAME_VERSION || ![0, 1].includes(game.p) || !isValidScores(game.s) || !isValidHistory(game.h, game.s)) {
    throw new Error("Invalid legacy game");
  }
  if (game.h.length % 2 !== game.p) throw new Error("Invalid active player");
  return { activePlayer: game.p, scores: game.s, history: game.h };
}

function isValidScores(scores) {
  return Array.isArray(scores) && scores.length === 2 && scores.every((card) =>
    Array.isArray(card) && card.length === CATEGORIES.length && card.every((score) =>
      score === null || (Number.isInteger(score) && score >= 0 && score <= 50)
    )
  );
}

function isValidHistory(history, scores) {
  if (!Array.isArray(history) || history.length > CATEGORIES.length * 2) return false;
  const seen = [new Set(), new Set()];
  for (let index = 0; index < history.length; index++) {
    const turn = history[index];
    if (!Array.isArray(turn) || turn.length !== 4 || turn[0] !== index % 2) return false;
    const [player, categoryIndex, dice, score] = turn;
    if (!Number.isInteger(categoryIndex) || !CATEGORIES[categoryIndex] || seen[player].has(categoryIndex)) return false;
    if (!Array.isArray(dice) || dice.length !== 5 || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) return false;
    if (score !== scoreDice(CATEGORIES[categoryIndex].id, dice) || scores[player][categoryIndex] !== score) return false;
    seen[player].add(categoryIndex);
  }
  return scores.every((card, player) => card.every((score, categoryIndex) =>
    (score === null) === !seen[player].has(categoryIndex)
  ));
}

async function loadGameFromUrl() {
  const encoded = new URLSearchParams(window.location.search).get("game");
  if (!encoded) return true;

  try {
    const parts = encoded.split(".");
    if (parts.length !== 2 || await checksum(parts[0]) !== parts[1]) return false;
    const bytes = base64UrlToBytes(parts[0]);
    const game = bytes[0] === 123 ? decodeLegacyGame(bytes) : decodeCompactGame(bytes);

    state.players.forEach((player, playerIndex) => {
      CATEGORIES.forEach((category, categoryIndex) => {
        player.scores[category.id] = game.scores[playerIndex][categoryIndex];
      });
    });
    state.activePlayer = game.activePlayer;
    state.viewedPlayer = game.activePlayer;
    state.history = game.history;
    return true;
  } catch {
    return false;
  }
}

function scoreDice(categoryId, dice) {
  const counts = Array(7).fill(0);
  dice.forEach((value) => counts[value]++);
  const total = dice.reduce((sum, value) => sum + value, 0);
  const unique = [...new Set(dice)].sort();
  const sequence = unique.join("");

  if (UPPER_IDS.includes(categoryId)) {
    const value = UPPER_IDS.indexOf(categoryId) + 1;
    return counts[value] * value;
  }

  switch (categoryId) {
    case "threeKind": return counts.some((count) => count >= 3) ? total : 0;
    case "fourKind": return counts.some((count) => count >= 4) ? total : 0;
    case "fullHouse": return counts.includes(3) && counts.includes(2) ? 25 : 0;
    case "smallStraight": return ["1234", "2345", "3456"].some((run) => sequence.includes(run)) ? 30 : 0;
    case "largeStraight": return sequence === "12345" || sequence === "23456" ? 40 : 0;
    case "yahtzee": return counts.includes(5) ? 50 : 0;
    case "chance": return total;
    default: return 0;
  }
}

function getTotals(player) {
  const upper = UPPER_IDS.reduce((sum, id) => sum + (player.scores[id] ?? 0), 0);
  const bonus = upper >= 63 ? 35 : 0;
  const lower = CATEGORIES.filter((category) => category.section === "lower")
    .reduce((sum, category) => sum + (player.scores[category.id] ?? 0), 0);
  return { upper, bonus, lower, total: upper + bonus + lower };
}

function renderDice() {
  elements.diceTray.innerHTML = "";
  state.dice.forEach((value, index) => {
    const die = document.createElement("button");
    die.type = "button";
    die.className = `die${!state.hasRolled ? " unrolled" : ""}${state.held[index] ? " held" : ""}${state.rolling && !state.held[index] ? " rolling" : ""}`;
    die.disabled = !state.hasRolled || state.rolling || state.handoffPending;
    die.setAttribute("aria-label", state.hasRolled ? `${value}, ${state.held[index] ? "held" : "not held"}` : "Not rolled yet");
    die.setAttribute("aria-pressed", String(state.held[index]));
    if (state.hasRolled) {
      PIP_POSITIONS[value].forEach((position) => {
        const pip = document.createElement("span");
        pip.className = `pip pip-${position}`;
        die.appendChild(pip);
      });
    }
    die.addEventListener("click", () => toggleHold(index));
    elements.diceTray.appendChild(die);
  });
}

function createDie(value, className = "die") {
  const die = document.createElement("div");
  die.className = className;
  PIP_POSITIONS[value].forEach((position) => {
    const pip = document.createElement("span");
    pip.className = `pip pip-${position}`;
    die.appendChild(pip);
  });
  return die;
}

function renderScoreOptions() {
  const scores = state.players[state.activePlayer].scores;
  elements.scoreOptions.innerHTML = "";
  CATEGORIES.forEach((category) => {
    const option = document.createElement("button");
    const available = scores[category.id] === null;
    const preview = state.hasRolled && available ? scoreDice(category.id, state.dice) : null;
    option.type = "button";
    option.className = "score-option";
    option.disabled = !state.hasRolled || !available || state.rolling || state.handoffPending;
    option.innerHTML = `<span>${category.label}<small>${available ? category.detail : "Already scored"}</small></span><strong>${available ? (preview ?? "—") : scores[category.id]}</strong>`;
    option.addEventListener("click", () => requestScore(category.id));
    elements.scoreOptions.appendChild(option);
  });
}

function scoreRows(categories, player) {
  return categories.map((category) => {
    const value = player.scores[category.id];
    return `<div class="score-row ${value === null ? "empty" : ""}"><span>${category.label}</span><span>${value ?? "—"}</span></div>`;
  }).join("");
}

function renderScorecard() {
  const player = state.players[state.viewedPlayer];
  const totals = getTotals(player);
  const upper = CATEGORIES.filter((category) => category.section === "upper");
  const lower = CATEGORIES.filter((category) => category.section === "lower");
  elements.scorecard.innerHTML = `
    <div class="score-section-label">Upper section</div>
    ${scoreRows(upper, player)}
    <div class="score-row summary-row"><span>Upper subtotal</span><span>${totals.upper}</span></div>
    <div class="score-row"><span>Bonus at 63</span><span>${totals.bonus || "—"}</span></div>
    <div class="score-section-label">Lower section</div>
    ${scoreRows(lower, player)}
    <div class="score-row grand-total"><span>Total</span><span>${totals.total}</span></div>`;

  document.querySelectorAll(".player-tab").forEach((tab, index) => {
    tab.classList.toggle("active", index === state.viewedPlayer);
    tab.setAttribute("aria-selected", String(index === state.viewedPlayer));
    document.querySelector(`#tab-total-${index}`).textContent = getTotals(state.players[index]).total;
  });
}

function renderStatus() {
  elements.activePlayer.textContent = state.players[state.activePlayer].name;
  elements.rollsLeft.textContent = state.rollsLeft;
  elements.rollButton.disabled = state.rollsLeft === 0 || state.rolling || state.handoffPending;
  elements.rollLabel.textContent = state.hasRolled ? "Roll again" : "Roll the dice";
  elements.holdHint.textContent = !state.hasRolled ? "Roll to start your turn" : state.rollsLeft ? "Tap dice to hold them" : "Choose a category below";
  elements.scoreNote.textContent = state.hasRolled ? "Select any open category to end your turn" : "Roll first to see your options";
}

function render() {
  renderDice();
  renderScoreOptions();
  renderScorecard();
  renderStatus();
}

function toggleHold(index) {
  if (!state.hasRolled || state.rolling) return;
  state.held[index] = !state.held[index];
  renderDice();
}

function rollDice() {
  if (state.rollsLeft === 0 || state.rolling) return;
  state.rolling = true;
  state.hasRolled = true;
  state.rollsLeft--;
  state.dice = state.dice.map((value, index) => state.held[index] ? value : Math.floor(Math.random() * 6) + 1);
  render();
  window.setTimeout(() => {
    state.rolling = false;
    render();
  }, 360);
}

function requestScore(categoryId) {
  if (!state.hasRolled || state.players[state.activePlayer].scores[categoryId] !== null) return;
  const category = CATEGORIES.find((candidate) => candidate.id === categoryId);
  pendingCategoryId = categoryId;
  elements.confirmCategory.textContent = category.label;
  elements.confirmScore.textContent = scoreDice(categoryId, state.dice);
  elements.scoreConfirmation.showModal();
}

function cancelScore() {
  pendingCategoryId = null;
  elements.scoreConfirmation.close();
}

async function confirmScore() {
  const categoryId = pendingCategoryId;
  if (!categoryId) return;
  pendingCategoryId = null;
  elements.scoreConfirmation.close();
  await chooseScore(categoryId);
}

async function chooseScore(categoryId) {
  if (!state.hasRolled || state.players[state.activePlayer].scores[categoryId] !== null) return;
  const score = scoreDice(categoryId, state.dice);
  state.players[state.activePlayer].scores[categoryId] = score;
  state.history.push([state.activePlayer, CATEGORIES.findIndex((category) => category.id === categoryId), [...state.dice], score]);

  if (state.players.every((player) => CATEGORIES.every((category) => player.scores[category.id] !== null))) {
    render();
    showGameOver();
    return;
  }

  state.activePlayer = state.activePlayer === 0 ? 1 : 0;
  state.viewedPlayer = state.activePlayer;
  state.dice = [1, 2, 3, 4, 5];
  state.held = [false, false, false, false, false];
  state.rollsLeft = 3;
  state.hasRolled = false;
  render();
  await showHandoff();
}

async function showHandoff() {
  state.handoffPending = true;
  elements.nextPlayer.textContent = state.players[state.activePlayer].name;
  elements.shareLink.value = await createGameUrl();
  window.history.replaceState({}, "", elements.shareLink.value);
  elements.copyStatus.textContent = "";
  elements.returnToHandoff.hidden = true;
  render();
  elements.handoffDialog.showModal();
}

function browseLedger() {
  elements.handoffDialog.close();
  elements.returnToHandoff.hidden = false;
}

function reopenHandoff() {
  elements.returnToHandoff.hidden = true;
  elements.handoffDialog.showModal();
}

function showTurnSummary() {
  const [playerIndex, categoryIndex, dice, score] = state.history.at(-1);
  elements.previousPlayer.textContent = state.players[playerIndex].name;
  elements.previousCategory.textContent = CATEGORIES[categoryIndex].label;
  elements.previousScore.textContent = score;
  elements.continueCopy.textContent = `${state.players[state.activePlayer].name}, the dice are yours.`;
  elements.summaryDice.innerHTML = "";
  dice.forEach((value) => elements.summaryDice.appendChild(createDie(value, "summary-die")));
  elements.turnSummary.showModal();
}

async function copyGameLink() {
  try {
    await navigator.clipboard.writeText(elements.shareLink.value);
    elements.copyStatus.textContent = "Copied. Send it to the next player.";
  } catch {
    elements.shareLink.select();
    elements.copyStatus.textContent = "Select and copy the link above.";
  }
}

function showGameOver() {
  const totals = state.players.map(getTotals);
  const tied = totals[0].total === totals[1].total;
  const winner = totals[0].total > totals[1].total ? state.players[0] : state.players[1];
  elements.winnerTitle.textContent = tied ? "A perfect tie." : `${winner.name} wins.`;
  elements.winnerCopy.textContent = tied ? "The dice could not separate you." : "Thirteen rounds, five dice, one well-earned victory.";
  elements.finalScores.innerHTML = state.players.map((player, index) => `<div class="final-score"><span>${player.name}</span><strong>${totals[index].total}</strong></div>`).join("");
  elements.gameOver.showModal();
}

function resetGame() {
  state.players = [createPlayer("Player One"), createPlayer("Player Two")];
  state.activePlayer = 0;
  state.viewedPlayer = 0;
  state.dice = [1, 2, 3, 4, 5];
  state.held = [false, false, false, false, false];
  state.rollsLeft = 3;
  state.hasRolled = false;
  state.rolling = false;
  state.history = [];
  state.handoffPending = false;
  pendingCategoryId = null;
  window.history.replaceState({}, "", window.location.pathname);
  if (elements.gameOver.open) elements.gameOver.close();
  if (elements.handoffDialog.open) elements.handoffDialog.close();
  if (elements.turnSummary.open) elements.turnSummary.close();
  if (elements.scoreConfirmation.open) elements.scoreConfirmation.close();
  if (elements.invalidGame.open) elements.invalidGame.close();
  elements.returnToHandoff.hidden = true;
  render();
}

elements.rollButton.addEventListener("click", rollDice);
document.querySelector("#new-game").addEventListener("click", resetGame);
document.querySelector("#play-again").addEventListener("click", resetGame);
document.querySelector("#handoff-new-game").addEventListener("click", resetGame);
document.querySelector("#invalid-new-game").addEventListener("click", resetGame);
document.querySelector("#copy-link").addEventListener("click", copyGameLink);
document.querySelector("#browse-ledger").addEventListener("click", browseLedger);
elements.returnToHandoff.addEventListener("click", reopenHandoff);
document.querySelector("#continue-game").addEventListener("click", () => elements.turnSummary.close());
document.querySelector("#cancel-score").addEventListener("click", cancelScore);
document.querySelector("#confirm-score-button").addEventListener("click", confirmScore);
elements.handoffDialog.addEventListener("cancel", (event) => event.preventDefault());
elements.turnSummary.addEventListener("cancel", (event) => event.preventDefault());
elements.scoreConfirmation.addEventListener("cancel", cancelScore);
elements.invalidGame.addEventListener("cancel", (event) => event.preventDefault());
document.querySelectorAll(".player-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.viewedPlayer = Number(tab.dataset.player);
    renderScorecard();
  });
});

loadGameFromUrl().then((valid) => {
  render();
  if (!valid) elements.invalidGame.showModal();
  else if (state.history.length === CATEGORIES.length * 2) showGameOver();
  else if (state.history.length > 0) showTurnSummary();
});
