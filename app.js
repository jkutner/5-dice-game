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
  rolling: false
};

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
  finalScores: document.querySelector("#final-scores")
};

function createPlayer(name) {
  return { name, scores: Object.fromEntries(CATEGORIES.map((category) => [category.id, null])) };
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
    die.className = `die${state.held[index] ? " held" : ""}${state.rolling && !state.held[index] ? " rolling" : ""}`;
    die.disabled = !state.hasRolled || state.rolling;
    die.setAttribute("aria-label", `${value}, ${state.held[index] ? "held" : "not held"}`);
    die.setAttribute("aria-pressed", String(state.held[index]));
    PIP_POSITIONS[value].forEach((position) => {
      const pip = document.createElement("span");
      pip.className = `pip pip-${position}`;
      die.appendChild(pip);
    });
    die.addEventListener("click", () => toggleHold(index));
    elements.diceTray.appendChild(die);
  });
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
    option.disabled = !state.hasRolled || !available || state.rolling;
    option.innerHTML = `<span>${category.label}<small>${available ? category.detail : "Already scored"}</small></span><strong>${available ? (preview ?? "—") : scores[category.id]}</strong>`;
    option.addEventListener("click", () => chooseScore(category.id));
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
  elements.rollButton.disabled = state.rollsLeft === 0 || state.rolling;
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

function chooseScore(categoryId) {
  if (!state.hasRolled || state.players[state.activePlayer].scores[categoryId] !== null) return;
  state.players[state.activePlayer].scores[categoryId] = scoreDice(categoryId, state.dice);

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
  if (elements.gameOver.open) elements.gameOver.close();
  render();
}

elements.rollButton.addEventListener("click", rollDice);
document.querySelector("#new-game").addEventListener("click", resetGame);
document.querySelector("#play-again").addEventListener("click", resetGame);
document.querySelectorAll(".player-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.viewedPlayer = Number(tab.dataset.player);
    renderScorecard();
  });
});

render();
