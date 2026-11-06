(() => {
  const app = document.querySelector("#eq-app");
  const form = document.querySelector("#filters");
  const resultsList = document.querySelector("#results-list");
  const resultCount = document.querySelector("#result-count");
  const noResults = document.querySelector("#no-results");
  const loadMore = document.querySelector("#load-more");
  const loadError = document.querySelector("#load-error");
  const searchInput = document.querySelector("#search");
  const sortControl = document.querySelector(".sort-segments");
  const shareButton = document.querySelector(".share-button");
  const shareStatus = document.querySelector(".share-status");
  const weaponMaster = document.querySelector('[data-category="weapon"]');
  const weaponOptions = document.querySelector("[data-weapon-options]");
  const pageSize = 100;
  const searchDelay = 250;
  let items = [];
  let filteredItems = [];
  let visibleCount = pageSize;
  let hasSearch = false;
  let searchTimer;

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
  const weaponSubtypeCodes = new Map([
    ["1 Handed Weapons", "1h"],
    ["2 Handed Weapons", "2h"],
    ["Fire Weapons", "fire"],
    ["Throw-only Weapons", "throw"]
  ]);
  const weaponSubtypeNames = new Map([...weaponSubtypeCodes].map(([name, code]) => [code, name]));
  const triStateFilters = ["forge", "personal", "shapeshift", "temporary", "drachma", "hidden"];

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
    } else if (filter === "hidden") {
      matches = Boolean(item.hidden);
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
    for (const filter of document.querySelectorAll("[data-tristate]")) {
      triStates[filter.dataset.tristate] = filter.querySelector("input:checked").value;
    }
    return {
      categories: selectedValues("[data-category]"),
      weaponSubtypes: selectedValues("[data-weapon-subtype]"),
      stats: selectedValues("[data-stat]"),
      levels,
      triStates,
      query: searchInput.value.trim()
    };
  }

  function updateUrl() {
    const filters = getCurrentFilters();
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    for (const category of filters.categories) params.append("cat", category);
    if (filters.categories.includes("weapon")) {
      for (const subtype of filters.weaponSubtypes) {
        const code = weaponSubtypeCodes.get(subtype);
        if (code) params.append("sub", code);
      }
    }
    for (const stat of filters.stats) params.append("stat", stat);
    for (const [className, level] of Object.entries(filters.levels)) {
      if (level !== null) params.set(className, String(level));
    }
    for (const filter of triStateFilters) {
      if (filter === "hidden") {
        if (filters.triStates.hidden === "yes" || filters.triStates.hidden === "any") {
          params.set("hidden", filters.triStates.hidden);
        }
      } else if (filters.triStates[filter] !== "any") {
        params.set(filter, filters.triStates[filter]);
      }
    }
    const sort = sortControl.querySelector("input:checked").value;
    if (sort !== "ac") params.set("sort", sort);

    const url = new URL(location.href);
    url.search = params.toString();
    history.replaceState(null, "", url);
  }

  function applyUrlState() {
    const params = new URLSearchParams(location.search);
    searchInput.value = params.get("q") || "";

    const categories = new Set(params.getAll("cat"));
    for (const input of document.querySelectorAll("[data-category]")) {
      input.checked = categories.has(input.dataset.category);
    }

    if (params.has("sub") || categories.has("weapon")) {
      const subtypes = new Set(params.getAll("sub").map(code => weaponSubtypeNames.get(code)).filter(Boolean));
      for (const input of document.querySelectorAll("[data-weapon-subtype]")) {
        input.checked = subtypes.has(input.dataset.weaponSubtype);
      }
    }

    const stats = new Set(params.getAll("stat"));
    for (const input of document.querySelectorAll("[data-stat]")) {
      input.checked = stats.has(input.dataset.stat);
    }

    for (const input of document.querySelectorAll("[data-level]")) {
      const value = params.get(input.dataset.level);
      input.value = value !== null && /^\d{1,2}$/.test(value) && Number(value) <= 99 ? value : "";
    }

    for (const filter of triStateFilters.filter(name => name !== "hidden")) {
      const value = params.get(filter);
      if (value === "yes" || value === "no") {
        const input = document.querySelector(`[data-tristate="${filter}"] input[value="${value}"]`);
        if (input) input.checked = true;
      }
    }

    const hiddenValue = params.get("hidden");
    const hiddenState = hiddenValue === "1" ? "any" : hiddenValue;
    if (hiddenState === "any" || hiddenState === "yes" || hiddenState === "no") {
      document.querySelector(`[data-tristate="hidden"] input[value="${hiddenState}"]`).checked = true;
    }
    const sort = params.get("sort");
    const sortInput = sortControl.querySelector(`input[value="${sort}"]`);
    if (sortInput) sortInput.checked = true;
    if (stats.size) document.querySelector(".stats-filter").open = true;
  }

  function filterItems() {
    const filters = getCurrentFilters();
    hasSearch = filters.query.length > 0;
    const hiddenState = filters.triStates.hidden;
    let visibleItems = hiddenState === "any"
      ? items
      : items.filter(item => Boolean(item.hidden) === (hiddenState === "yes"));

    if (hasSearch) {
      visibleItems = visibleItems.filter(item => matchesTextSearch(item, filters.query));
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
      if (filter !== "hidden" && state !== "any") {
        visibleItems = visibleItems.filter(item => matchesTriState(item, filter, state));
      }
    }

    const isDefault = !hasSearch
      && selectedCategories.length === 0
      && filters.stats.length === 0
      && !hasClassLevels(filters.levels)
      && triStateFilters.filter(filter => filter !== "hidden")
        .every(filter => filters.triStates[filter] === "any");
    return { results: visibleItems, isDefault };
  }

  function statValue(item, stat) {
    const match = (item.stats || "").match(new RegExp(`(?:^|,\\s*)${stat}\\s+(-?\\d+(?:\\.\\d+)?)`, "i"));
    return match ? Number(match[1]) : 0;
  }

  function weaponDamage(item, averageDice = true) {
    const match = (item.weaponDice || "").match(/(\d+)d(\d+)\s+[+-]?\d+\s+([+-]?\d+)/i);
    if (match) {
      const dice = Number(match[1]);
      const sides = Number(match[2]);
      return dice * (averageDice ? (sides + 1) / 2 : sides) + Number(match[3]);
    }
    return statValue(item, "Dam");
  }

  function sortItems(result) {
    const mode = sortControl.querySelector("input:checked").value;
    if (mode === "name") return result.sort((a, b) => a.name.localeCompare(b.name));
    const metric = {
      ac: item => Number(item.ac) || 0,
      dam: item => weaponDamage(item, 1),
      mana: item => statValue(item, "Mp") + statValue(item, "MaxInt") * 15,
      mr: item => statValue(item, "Mr") + statValue(item, "MaxWis")
    }[mode];
    if (!metric) return result;

    return result.sort((a, b) => {
      const primary = metric(a) - metric(b);
      if (primary !== 0) return mode === "ac" ? primary : -primary;
      if (mode !== "ac") {
        const armorClass = (Number(a.ac) || 0) - (Number(b.ac) || 0);
        if (armorClass !== 0) return armorClass;
      }
      return weaponDamage(b, false) - weaponDamage(a, false) || a.name.localeCompare(b.name);
    });
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

  function updateWeaponControls() {
    const enabled = weaponMaster.checked;
    weaponOptions.classList.toggle("is-disabled", !enabled);
    weaponOptions.setAttribute("aria-disabled", String(!enabled));
    for (const input of weaponOptions.querySelectorAll("input")) {
      input.disabled = !enabled;
    }
  }

  function updateTypeControls() {
    const categories = [...document.querySelectorAll(".equipment-filter [data-category]")];
    const hasSelection = categories.some(input => input.checked);
    for (const input of categories) {
      input.closest("label").classList.toggle("is-unselected", hasSelection && !input.checked);
    }
  }

  function renderResultGroups(shownItems, isDefault, collapsedGroups = new Set()) {
    resultsList.replaceChildren();

    const groups = new Map();
    const groupName = item => isDefault ? "Most Recently Discovered" : (item.group || "Other");
    for (const item of shownItems) {
      const group = groupName(item);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }

    const groupCounts = new Map();
    for (const item of filteredItems) {
      const group = groupName(item);
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    }

    for (const [group, groupItems] of groups) {
      const section = document.createElement("details");
      section.className = "result-group";
      section.dataset.group = group;
      section.open = !collapsedGroups.has(group);

      const heading = document.createElement("summary");
      heading.textContent = `${group} (${groupCounts.get(group)})`;
      section.append(heading);

      const content = document.createElement("div");
      content.className = "result-group-items";
      for (const item of groupItems) content.append(createItemCard(item));
      section.append(content);
      resultsList.append(section);
    }
  }

  function render() {
    const { results, isDefault } = filterItems();
    filteredItems = sortItems(results);
    visibleCount = pageSize;
    const shown = filteredItems.slice(0, visibleCount);
    renderResultGroups(shown, isDefault);

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
    clearTimeout(searchTimer);
    updateUrl();
    render();
  });
  form.addEventListener("change", event => {
    if (event.target === weaponMaster) updateWeaponControls();
    if (event.target.matches("[data-category]")) updateTypeControls();
    updateUrl();
    render();
  });
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      updateUrl();
      render();
    }, searchDelay);
  });
  sortControl.addEventListener("change", () => {
    updateUrl();
    render();
  });
  shareButton.addEventListener("click", async () => {
    updateUrl();
    try {
      await navigator.clipboard.writeText(location.href);
      shareStatus.textContent = "Link copied to clipboard.";
    } catch (error) {
      shareStatus.textContent = "Could not copy link. Copy it from the address bar.";
    }
  });
  window.addEventListener("popstate", () => {
    clearTimeout(searchTimer);
    applyUrlState();
    updateWeaponControls();
    updateTypeControls();
    render();
  });
  loadMore.addEventListener("click", () => {
    visibleCount += pageSize;
    const collapsedGroups = new Set(
      [...resultsList.querySelectorAll(".result-group:not([open])")].map(group => group.dataset.group)
    );
    const shownItems = filteredItems.slice(0, visibleCount);
    const filters = getCurrentFilters();
    const isDefault = !hasSearch && filters.categories.length === 0
      && filters.stats.length === 0
      && !hasClassLevels(filters.levels)
      && triStateFilters.filter(filter => filter !== "hidden")
        .every(filter => filters.triStates[filter] === "any");
    renderResultGroups(shownItems, isDefault, collapsedGroups);
    resultCount.textContent = `${filteredItems.length.toLocaleString()} items found · showing ${shownItems.length.toLocaleString()}`;
    loadMore.hidden = shownItems.length >= filteredItems.length;
  });
  form.addEventListener("reset", () => {
    clearTimeout(searchTimer);
    sortControl.querySelector('input[value="ac"]').checked = true;
    requestAnimationFrame(() => {
      updateWeaponControls();
      updateTypeControls();
      updateUrl();
      render();
    });
  });

  applyUrlState();
  updateWeaponControls();
  updateTypeControls();
  updateUrl();
  loadData();
})();
