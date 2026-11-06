(() => {
  const app = document.querySelector("#eq-app");
  const form = document.querySelector("#filters");
  const resultsList = document.querySelector("#results-list");
  const resultCount = document.querySelector("#result-count");
  const noResults = document.querySelector("#no-results");
  const loadMore = document.querySelector("#load-more");
  const loadError = document.querySelector("#load-error");
  const searchInput = document.querySelector("#search");
  const sortSelect = document.querySelector("#sort");
  const pageSize = 100;
  let items = [];
  let filteredItems = [];
  let visibleCount = pageSize;
  let hasSearch = false;

  const categoryMatches = {
    weapon: item => item.group === "1 Handed Weapons"
      || item.group === "2 Handed Weapons"
      || item.group === "Fire Weapons"
      || item.group === "Throw-only Weapons",
    light: item => item.group === "Light" || item.type === "LIGHT",
    finger: item => item.group === "TAKE FINGER",
    neck: item => item.group === "TAKE NECK" || item.group === "TAKE NECK THROW",
    body: item => item.group === "TAKE BODY",
    head: item => item.group === "TAKE HEAD",
    legs: item => item.group === "TAKE LEGS",
    feet: item => item.group === "TAKE FEET",
    hands: item => item.group === "TAKE HANDS" || item.group === "TAKE HANDS THROW",
    arms: item => item.group === "TAKE ARMS",
    shield: item => item.group === "TAKE SHIELD" || item.group === "SHIELD" || item.group === "TAKE SHIELD THROW",
    robe: item => item.group === "TAKE ABOUT" || item.group === "TAKE ABOUT HOLD",
    waist: item => item.group === "TAKE WAIST",
    wrist: item => item.group === "TAKE WRIST" || item.group === "WRIST",
    held: item => item.group === "TAKE HOLD",
    instrument: item => item.group === "TAKE INSTRUMENT",
    book: item => item.type === "SPELLBOOK" || item.group === "Spellbooks",
    clasp: item => item.type === "CLASP",
    rune: item => item.type === "RUNE",
    potion: item => item.type === "POTION" || item.group === "Potions",
    container: item => item.type === "CONTAINER",
    liquid: item => (item.type === "FOUNTAIN" || item.type === "LIQUID CONTAINER") && item.group.startsWith("TAKE"),
    scroll: item => item.type === "SCROLL" || item.group === "Scrolls",
    wand: item => item.type === "WAND" || item.group === "Wands",
    key: item => item.type === "KEY" || item.group === "Keys",
    note: item => item.type === "NOTE" || item.group === "Notes",
    treasure: item => item.type === "TREASURE" || item.group === "Treasures"
  };
  const statAliases = {
    Spellbonus: ["Spellbonus"],
    Healbonus: ["Healbonus"],
    UndeadControl: ["UndeadControl"],
    WaterBreathing: ["WaterBreathing"]
  };
  const classLevels = ["Th", "Ma", "Cl", "Dr", "Mo", "Ba", "Ne", "Wa"];
  const hiddenIncludedByDefault = false;

  function flatten(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(flatten).join(" ");
    if (typeof value === "object") return Object.values(value).map(flatten).join(" ");
    return String(value);
  }

  function searchableText(item) {
    return flatten(item).toLocaleLowerCase();
  }

  function wildcardExpression(query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    return new RegExp(`.*${escaped}.*`, "i");
  }

  function selectedValues(selector) {
    return [...document.querySelectorAll(selector)]
      .filter(input => input.checked)
      .map(input => input.dataset.category || input.dataset.weaponSubtype || input.dataset.stat || input.value);
  }

  function statNames(item) {
    return (item.stats || "")
      .split(",")
      .map(value => value.trim().split(/\s+/)[0].toLocaleLowerCase())
      .filter(Boolean);
  }

  function hasStat(item, stat) {
    const names = statAliases[stat] || [stat];
    const present = statNames(item);
    return names.some(name => present.includes(name.toLocaleLowerCase()));
  }

  function flags(item) {
    return `${item.extra1 || ""} ${item.extra2 || ""}`.toLocaleUpperCase();
  }

  function hasClassLevels(levels) {
    return Object.values(levels).some(level => level !== null);
  }

  function restrictionLevels(item) {
    const levels = {};
    const text = (item.restricts || "").replace(/<[^>]*>/g, " ");
    for (const match of text.matchAll(/\b(Ma|Cl|Th|Wa|Dr|Ne|Ba|Mo|Av)\s*(\d+)\b/gi)) {
      levels[match[1].toLocaleLowerCase()] = Number(match[2]);
    }
    return levels;
  }

  function meetsClassLevels(item, levels) {
    const required = restrictionLevels(item);
    for (const [className, level] of Object.entries(levels)) {
      if (level !== null && required[className.toLocaleLowerCase()] > level) return false;
    }

    const hasLevels = hasClassLevels(levels);
    if (!hasLevels) return true;

    const flagsText = flags(item);
    let fortiesRequired = 0;
    for (let count = 1; count <= 8; count += 1) {
      if (flagsText.includes(`${count}X40-ITEM`)) fortiesRequired = count;
    }
    const fortiesEntered = classLevels.filter(className => (levels[className] ?? -1) >= 40).length;
    if (fortiesRequired > fortiesEntered) return false;

    if (!levels.Av && required.av) return false;
    return true;
  }

  function matchesTriState(item, filter, state) {
    if (state === "any") return true;
    const itemFlags = flags(item);
    let matches;
    if (filter === "forge") {
      const forger = Number(item.forger || 0);
      matches = forger > 0 && forger !== 19396;
    } else if (filter === "personal") {
      matches = itemFlags.includes("PERSONAL");
    } else if (filter === "shapeshift") {
      matches = itemFlags.includes("CAN-SHAPESHIFT");
    } else if (filter === "temporary") {
      matches = itemFlags.includes("TEMPORARY");
    } else {
      matches = /\bDrachma\s*\[\s*[1-9]\d*\s*\]/i.test(item.stats || "");
    }
    return state === "yes" ? matches : !matches;
  }

  function matchesTextSearch(item, query) {
    if (/^\d+$/.test(query)) return String(item.vnum) === query;
    return wildcardExpression(query).test(searchableText(item));
  }

  function getCurrentFilters() {
    const levels = {};
    for (const input of document.querySelectorAll("[data-level]")) {
      levels[input.dataset.level] = input.value === "" ? null : Number(input.value);
    }
    const triStates = {};
    for (const select of document.querySelectorAll("[data-tristate]")) {
      triStates[select.dataset.tristate] = select.value;
    }
    return {
      categories: selectedValues("[data-category]"),
      weaponSubtypes: selectedValues("[data-weapon-subtype]"),
      stats: selectedValues("[data-stat]"),
      levels,
      triStates,
      includeHidden: document.querySelector("[data-include-hidden]").checked || hiddenIncludedByDefault,
      query: searchInput.value.trim()
    };
  }

  function filterItems() {
    const filters = getCurrentFilters();
    hasSearch = filters.query.length > 0;
    let visibleItems = items.filter(item => filters.includeHidden || !item.hidden);

    if (hasSearch) {
      visibleItems = visibleItems.filter(item => matchesTextSearch(item, filters.query));
      return { results: visibleItems, isDefault: false };
    }

    const selectedCategories = filters.categories;
    if (selectedCategories.length) {
      visibleItems = visibleItems.filter(item => selectedCategories.some(category => {
        if (category === "weapon") {
          return filters.weaponSubtypes.length > 0
            && filters.weaponSubtypes.some(group => item.group === group)
            && categoryMatches.weapon(item);
        }
        return categoryMatches[category](item);
      }));
    }

    if (filters.stats.length) {
      visibleItems = visibleItems.filter(item => filters.stats.every(stat => hasStat(item, stat)));
    }

    if (hasClassLevels(filters.levels)) {
      visibleItems = visibleItems.filter(item => meetsClassLevels(item, filters.levels));
    }

    for (const [filter, state] of Object.entries(filters.triStates)) {
      if (state !== "any") visibleItems = visibleItems.filter(item => matchesTriState(item, filter, state));
    }

    const isDefault = selectedCategories.length === 0
      && filters.stats.length === 0
      && !hasClassLevels(filters.levels)
      && Object.values(filters.triStates).every(state => state === "any");
    return { results: visibleItems, isDefault };
  }

  function parseDate(value) {
    const timestamp = Date.parse(value || "");
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function sortItems(result, isDefault) {
    const mode = sortSelect.value;
    if (mode === "name") return result.sort((a, b) => a.name.localeCompare(b.name));
    if (mode === "vnum") return result.sort((a, b) => Number(a.vnum) - Number(b.vnum));
    if (mode === "date" || (mode === "relevance" && isDefault)) {
      return result.sort((a, b) => parseDate(b.dateadded) - parseDate(a.dateadded) || Number(b.vnum) - Number(a.vnum));
    }
    return result;
  }

  function appendDetail(list, label, value) {
    if (value === undefined || value === null || value === "") return;
    const row = document.createElement("div");
    const title = document.createElement("dt");
    const detail = document.createElement("dd");
    title.textContent = `${label}:`;
    detail.textContent = Array.isArray(value) ? value.map(flatten).join(", ") : flatten(value);
    row.append(title, detail);
    list.append(row);
  }

  function createItemCard(item) {
    const article = document.createElement("article");
    article.className = "item-card";

    const titleRow = document.createElement("div");
    titleRow.className = "item-title";
    const title = document.createElement("h4");
    title.textContent = item.name || "(unnamed item)";
    const vnum = document.createElement("span");
    vnum.className = "vnum";
    vnum.textContent = `#${item.vnum}`;
    titleRow.append(title, vnum);
    article.append(titleRow);

    const badges = document.createElement("div");
    badges.className = "item-badges";
    for (const value of [item.type, item.group, item.hidden ? "Hidden" : ""]) {
      if (!value) continue;
      const badge = document.createElement("span");
      badge.className = value === "Hidden" ? "badge hidden-badge" : "badge";
      badge.textContent = value;
      badges.append(badge);
    }
    article.append(badges);

    const details = document.createElement("dl");
    details.className = "item-details";
    appendDetail(details, "Keywords", item.keywords);
    appendDetail(details, "Stats", item.stats);
    appendDetail(details, "Restrictions", item.restricts);
    appendDetail(details, "AC", item.ac);
    appendDetail(details, "Flags", [item.extra1, item.extra2].filter(Boolean).join(" / "));
    appendDetail(details, "Weapon dice", item.weaponDice);
    appendDetail(details, "Throw", item.weaponThrow);
    appendDetail(details, "Forge", item.forgeType ? `${item.forgeType}; cost ${item.forgeCost}; explosion ${item.forgeExplosion}` : "");
    appendDetail(details, "Forger VNUM", item.forger);
    appendDetail(details, "Forger", item.forgerName);
    appendDetail(details, "Found on mobs", item.mobs);
    appendDetail(details, "Mob names", item.mobNames);
    appendDetail(details, "Area names", item.areaNames);
    appendDetail(details, "Date added", item.dateadded);
    appendDetail(details, "Related items", item.cpFor);
    appendDetail(details, "Components", item.cps);
    appendDetail(details, "Clasps", item.claspsForItem);
    appendDetail(details, "Attachments", item.attach);
    if (details.childElementCount) article.append(details);
    return article;
  }

  function render() {
    const { results, isDefault } = filterItems();
    filteredItems = sortItems(results, isDefault);
    visibleCount = pageSize;
    const shown = filteredItems.slice(0, visibleCount);
    resultsList.replaceChildren();

    const groups = new Map();
    for (const item of shown) {
      const group = isDefault ? "Most Recently Discovered" : (item.group || "Other");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    for (const [group, groupItems] of groups) {
      const section = document.createElement("section");
      section.className = "result-group";
      const heading = document.createElement("h3");
      heading.textContent = `${group} (${filteredItems.filter(item => (isDefault ? "Most Recently Discovered" : item.group || "Other") === group).length})`;
      section.append(heading);
      for (const item of groupItems) section.append(createItemCard(item));
      resultsList.append(section);
    }

    resultCount.textContent = `${filteredItems.length.toLocaleString()} item${filteredItems.length === 1 ? "" : "s"} found${shown.length < filteredItems.length ? ` · showing ${shown.length.toLocaleString()}` : ""}`;
    noResults.hidden = filteredItems.length !== 0;
    loadMore.hidden = shown.length >= filteredItems.length;
  }

  async function loadData() {
    try {
      const response = await fetch(app.dataset.itemsUrl);
      if (!response.ok) throw new Error(`Item data request failed (${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error("Item data does not contain an items array.");
      items = data.items;
      render();
    } catch (error) {
      resultCount.textContent = "Could not load item data.";
      loadError.textContent = error instanceof Error ? error.message : "An unexpected error occurred while loading item data.";
      loadError.hidden = false;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    render();
  });
  form.addEventListener("change", render);
  searchInput.addEventListener("input", render);
  sortSelect.addEventListener("change", render);
  loadMore.addEventListener("click", () => {
    visibleCount += pageSize;
    const previousCount = visibleCount;
    const shownItems = filteredItems.slice(0, previousCount);
    resultsList.replaceChildren();
    const groups = new Map();
    const isDefault = !hasSearch && getCurrentFilters().categories.length === 0
      && selectedValues("[data-stat]").length === 0
      && !hasClassLevels(getCurrentFilters().levels)
      && Object.values(getCurrentFilters().triStates).every(state => state === "any");
    for (const item of shownItems) {
      const group = isDefault ? "Most Recently Discovered" : (item.group || "Other");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    for (const [group, groupItems] of groups) {
      const section = document.createElement("section");
      section.className = "result-group";
      const heading = document.createElement("h3");
      const count = filteredItems.filter(item => (isDefault ? "Most Recently Discovered" : item.group || "Other") === group).length;
      heading.textContent = `${group} (${count})`;
      section.append(heading);
      for (const item of groupItems) section.append(createItemCard(item));
      resultsList.append(section);
    }
    resultCount.textContent = `${filteredItems.length.toLocaleString()} items found · showing ${shownItems.length.toLocaleString()}`;
    loadMore.hidden = shownItems.length >= filteredItems.length;
  });
  form.addEventListener("reset", () => requestAnimationFrame(render));

  loadData();
})();
