(() => {
  const app = document.querySelector("#eq-app");
  const form = document.querySelector("#filters");
  const resultsList = document.querySelector("#results-list");
  const resultCount = document.querySelector("#result-count");
  const noResults = document.querySelector("#no-results");
  const loadError = document.querySelector("#load-error");
  const searchInput = document.querySelector("#search");
  const sortControl = document.querySelector(".sort-segments");
  const shareButton = document.querySelector(".share-button");
  const shareStatus = document.querySelector(".share-status");
  const renderBatchSize = 50;
  const searchDelay = 250;
  let items = [];
  let mobLocations = new Map();
  let filteredItems = [];
  let isDefaultResults = false;
  let hasSearch = false;
  let searchTimer;
  let activeRenderId = 0;

  const hasTakeSlot = (item, slot) => {
    const group = (item.group || "").split(/\s+/);
    return group[0] === "TAKE" && group.includes(slot);
  };
  const monthNumbers = new Map([
    ["jan", 0], ["feb", 1], ["mar", 2], ["apr", 3],
    ["may", 4], ["jun", 5], ["jul", 6], ["aug", 7],
    ["sep", 8], ["oct", 9], ["nov", 10], ["dec", 11]
  ]);
  function dateAddedTimestamp(item) {
    const match = (item.dateadded || "").match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
    if (!match) return Number.NEGATIVE_INFINITY;
    const month = monthNumbers.get(match[2].toLocaleLowerCase());
    if (month === undefined) return Number.NEGATIVE_INFINITY;
    return Date.UTC(Number(match[3]), month, Number(match[1]));
  }
  const categoryMatches = {
    weapon: item => item.group === "1 Handed Weapons"
      || item.group === "2 Handed Weapons"
      || item.group === "Fire Weapons"
      || item.group === "Throw-only Weapons",
    light: item => item.group === "Light" || item.type === "LIGHT",
    ammo: item => item.type === "MISSILE",
    finger: item => hasTakeSlot(item, "FINGER"),
    neck: item => hasTakeSlot(item, "NECK"),
    body: item => hasTakeSlot(item, "BODY"),
    head: item => hasTakeSlot(item, "HEAD"),
    legs: item => hasTakeSlot(item, "LEGS"),
    feet: item => hasTakeSlot(item, "FEET"),
    hands: item => hasTakeSlot(item, "HANDS"),
    arms: item => hasTakeSlot(item, "ARMS"),
    shield: item => item.group === "SHIELD" || hasTakeSlot(item, "SHIELD"),
    robe: item => hasTakeSlot(item, "ABOUT"),
    waist: item => hasTakeSlot(item, "WAIST"),
    wrist: item => item.group === "WRIST" || hasTakeSlot(item, "WRIST"),
    held: item => hasTakeSlot(item, "HOLD"),
    instrument: item => hasTakeSlot(item, "INSTRUMENT"),
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
  const equipmentGroupNames = {
    ammo: "AMMO",
    finger: "FINGER",
    neck: "NECK",
    body: "BODY",
    head: "HEAD",
    legs: "LEGS",
    feet: "FEET",
    hands: "HANDS",
    arms: "ARMS",
    shield: "SHIELD",
    robe: "ABOUT",
    waist: "WAIST",
    wrist: "WRIST",
    held: "HELD",
    instrument: "INSTRUMENT"
  };
  const statAliases = {
    Spellbonus: ["Spellbonus"],
    Healbonus: ["Healbonus"],
    UndeadControl: ["UndeadControl"],
    WaterBreathing: ["WaterBreathing"]
  };
  const statRawFields = {
    SavingPara: "AFF_SAVING_PARA",
    SavingPoison: "AFF_SAVING_POISON",
    SavingPetri: "AFF_SAVING_PETRI",
    SavingBreath: "AFF_SAVING_BREATH"
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

  function setTriState(filter, state) {
    const checkbox = document.querySelector(`[data-tristate="${filter}"] .tri-state-checkbox`);
    if (!checkbox || !["any", "yes", "no"].includes(state)) return;
    checkbox.dataset.state = state;
    checkbox.checked = state === "yes";
    checkbox.indeterminate = state === "no";
    const label = checkbox.closest(".tri-filter").querySelector("span").textContent;
    const stateLabel = state === "yes" ? "Required" : state === "no" ? "Excluded" : "Any";
    checkbox.setAttribute("aria-label", `${label}: ${stateLabel}`);
    checkbox.setAttribute("aria-checked", state === "yes" ? "true" : state === "no" ? "mixed" : "false");
  }

  function statNames(item) {
    return (item.stats || "")
      .split(",")
      .map(value => value.trim().split(/\s+/)[0].toLocaleLowerCase())
      .filter(Boolean);
  }

  function hasStat(item, stat) {
    if (stat === "Pierce") {
      return (item.stats || "").split(",").some(value => /^WeaponType\s+pierce$/i.test(value.trim()));
    }
    const rawField = statRawFields[stat];
    if (rawField) return String(item.raw?.[rawField] ?? "").trim() !== "";

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
      triStates[filter.dataset.tristate] = filter.querySelector(".tri-state-checkbox").dataset.state;
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
    for (const category of filters.categories) {
      if (category !== "weapon") params.append("cat", category);
    }
    for (const subtype of filters.weaponSubtypes) {
      const code = weaponSubtypeCodes.get(subtype);
      if (code) params.append("sub", code);
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
    let params = new URLSearchParams(location.search);
    const itemVnum = params.get("q");
    if (/^\d+$/.test(itemVnum || "")) params = new URLSearchParams({ q: itemVnum });
    searchInput.value = params.get("q") || "";

    const categories = new Set(params.getAll("cat"));
    for (const input of document.querySelectorAll("[data-category]")) {
      input.checked = categories.has(input.dataset.category);
    }

    const subtypes = params.has("sub")
      ? new Set(params.getAll("sub").map(code => weaponSubtypeNames.get(code)).filter(Boolean))
      : categories.has("weapon")
        ? new Set(weaponSubtypeCodes.keys())
        : new Set();
    for (const input of document.querySelectorAll("[data-weapon-subtype]")) {
      input.checked = subtypes.has(input.dataset.weaponSubtype);
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
      setTriState(filter, value || "any");
    }

    const hiddenValue = params.get("hidden");
    const hiddenState = hiddenValue === "1" ? "any" : hiddenValue;
    setTriState("hidden", hiddenState || "no");
    const sort = params.get("sort");
    const sortInput = sortControl.querySelector(`input[value="${sort}"]`);
    if (sortInput) sortInput.checked = true;
    else sortControl.querySelector('input[value="ac"]').checked = true;
    if (stats.size) {
      document.querySelectorAll(".resource-filter, .damage-filter, .attribute-filter, .bonus-filter")
        .forEach(group => { group.open = true; });
    }
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
    if (selectedCategories.length || filters.weaponSubtypes.length) {
      visibleItems = visibleItems.filter(item => (
        selectedCategories.some(category => categoryMatches[category]?.(item))
        || filters.weaponSubtypes.some(group => item.group === group)
      ));
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
      && filters.weaponSubtypes.length === 0
      && filters.stats.length === 0
      && !hasClassLevels(filters.levels)
      && hiddenState === "no"
      && triStateFilters.filter(filter => filter !== "hidden")
        .every(filter => filters.triStates[filter] === "any");
    return { results: visibleItems, isDefault, selectedCategories };
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
    if (label === "AC" || label === "HitDice" || label === "Weapon dice") {
      detail.classList.add("item-monospace-value");
    }
    if (label === "AC") {
      detail.classList.add("item-ac-value");
      const armorClass = Number(value);
      if (Number.isFinite(armorClass)) {
        const [integer, decimal] = armorClass.toFixed(1).split(".");
        detail.textContent = `${integer.padStart(3, " ")}.${decimal}`;
      } else {
        detail.textContent = flatten(value);
      }
    } else {
      detail.textContent = Array.isArray(value) ? value.map(flatten).join(", ") : flatten(value);
    }
    row.append(title, detail);
    list.append(row);
  }

  function appendMarker(list, text, className = "") {
    if (!text) return;
    const row = document.createElement("div");
    row.className = "item-detail-marker";
    if (className) row.classList.add(className);
    row.textContent = text;
    list.append(row);
  }

  function createSearchLink(value) {
    const name = flatten(value).trim();
    if (!name) return null;
    const target = new URL(location.href);
    target.search = "";
    target.searchParams.set("q", name);
    const link = document.createElement("a");
    link.className = "item-search-link";
    link.href = target.href;
    link.dataset.searchQuery = name;
    link.textContent = name;
    return link;
  }

  function appendMobSources(list, item) {
    const mobIds = Array.isArray(item.mobs) ? item.mobs : [];
    const mobNames = Array.isArray(item.mobNames) ? item.mobNames.map(flatten) : [];
    const areaNames = Array.isArray(item.areaNames) ? item.areaNames.map(flatten) : [];
    const sources = [];
    const addSource = (name, area = "", continent = "") => {
      const cleanName = flatten(name).trim();
      const cleanArea = flatten(area).trim();
      if (!cleanName && !cleanArea) return;
      const key = `${cleanName.toLocaleLowerCase()}\u0000${cleanArea.toLocaleLowerCase()}\u0000${continent}`;
      if (!sources.some(source => source.key === key)) {
        sources.push({ name: cleanName, area: cleanArea, continent, key });
      }
    };
    const fallbackArea = index => {
      if (areaNames.length === 1) return areaNames[0];
      if (areaNames.length === mobIds.length) return areaNames[index];
      return "";
    };

    mobIds.forEach((vnum, index) => {
      const location = mobLocations.get(String(vnum));
      if (location) {
        addSource(location.name, location.area, location.continent);
      } else if (mobNames.length === mobIds.length) {
        addSource(mobNames[index], fallbackArea(index));
      }
    });

    for (let index = 0; index < mobNames.length; index += 1) {
      if (sources.some(source => source.name.toLocaleLowerCase() === mobNames[index].trim().toLocaleLowerCase())) continue;
      addSource(mobNames[index], areaNames.length === 1 ? areaNames[0] : areaNames.length === mobNames.length ? areaNames[index] : "");
    }

    if (sources.length === 0 && areaNames.length) {
      areaNames.forEach(area => addSource("", area));
    }

    for (const source of sources) {
      const row = document.createElement("div");
      row.className = "item-mob-source";
      const detail = document.createElement("dd");
      const mobLink = createSearchLink(source.name);
      const areaLink = createSearchLink(source.area);
      if (mobLink) detail.append(mobLink);
      if (mobLink && areaLink) detail.append(document.createTextNode(" · "));
      if (areaLink) detail.append(areaLink);
      if (source.continent) detail.append(document.createTextNode(` [${source.continent}]`));
      row.append(detail);
      list.append(row);
    }
  }

  function appendCpForLinks(list, cpFor) {
    if (!cpFor || typeof cpFor !== "object" || Array.isArray(cpFor)) return;
    const row = document.createElement("div");
    const title = document.createElement("dt");
    const detail = document.createElement("dd");
    title.textContent = "CP for:";

    let linkCount = 0;
    Object.entries(cpFor).forEach(([vnum, name]) => {
      if (!/^\d+$/.test(vnum)) return;
      if (linkCount > 0) detail.append(document.createTextNode(", "));
      const target = new URL(location.href);
      target.search = "";
      target.searchParams.set("q", vnum);
      const link = document.createElement("a");
      link.className = "item-search-link";
      link.href = target.href;
      link.dataset.searchQuery = vnum;
      link.textContent = `${flatten(name)} (#${vnum})`;
      detail.append(link);
      linkCount += 1;
    });

    if (detail.childElementCount) {
      row.append(title, detail);
      list.append(row);
    }
  }

  function itemLayout(item) {
    const weaponGroups = ["1 Handed Weapons", "2 Handed Weapons", "Fire Weapons", "Throw-only Weapons"];
    if (weaponGroups.includes(item.group)) return "weapon";
    if ((item.group || "").startsWith("TAKE ")) return "worn";
    return "other";
  }

  function weaponHitDice(value) {
    if (!value) return "";
    const match = String(value).match(/^\s*(\d+d\d+)\s+([+-]?\d+)\s+([+-]?\d+)/i);
    if (!match) return String(value).trim();
    const formatModifier = modifier => {
      const number = Number(modifier);
      return `${number >= 0 ? "+" : ""}${number}`;
    };
    return `${match[1]} ${formatModifier(match[2])} ${formatModifier(match[3])}`;
  }

  function createItemCard(item, isDefault) {
    const article = document.createElement("article");
    const layout = isDefault ? "other" : itemLayout(item);
    article.className = `item-card item-card-${layout}`;

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

    const details = document.createElement("div");
    details.className = "item-details";
    const keywords = document.createElement("div");
    keywords.className = "item-keywords";
    appendTextLine(keywords, item.keywords, "item-keyword-primary");
    appendTextLine(keywords, item.dateadded ? `Date added: ${flatten(item.dateadded)}` : "");
    appendTextLine(keywords, item.restricts);
    appendTextLine(keywords, [item.extra1, item.extra2].filter(Boolean).join(" "));
    const primary = document.createElement("dl");
    primary.className = "item-detail-column";
    const attributes = document.createElement("dl");
    attributes.className = "item-detail-column";
    const source = document.createElement("dl");
    source.className = "item-detail-column";
    details.append(keywords, primary, attributes, source);

    if (layout === "worn") appendDetail(primary, "AC", item.ac);
    if (layout === "weapon") {
      appendMarker(primary, weaponHitDice(item.weaponDice), "item-monospace-value");
      if (item.weaponThrow) appendMarker(primary, "Throw");
    } else if (item.weaponThrow) {
      appendMarker(attributes, "Throw");
    }

    if (layout !== "worn" && Number(item.ac) !== 0) appendDetail(attributes, "AC", item.ac);
    if (layout !== "weapon") appendDetail(attributes, "Weapon dice", item.weaponDice);
    appendUnlabeledDetail(attributes, item.stats);
    const forgerVnum = Number(item.forger);
    if (item.forger && Number.isFinite(forgerVnum) && forgerVnum !== 0) {
      appendDetail(source, "Forger", item.forgerName);
    }
    appendDetail(source, "Forge", item.forgeType ? `${item.forgeType}; cost ${item.forgeCost}; explosion ${item.forgeExplosion}` : "");
    appendMobSources(source, item);
    appendCpForLinks(source, item.cpFor);
    appendDetail(source, "Components", item.cps);
    appendDetail(source, "Clasps", item.claspsForItem);
    appendDetail(source, "Attachments", item.attach);
    if (details.childElementCount) article.append(details);
    return article;
  }

  function appendTextLine(container, value, className = "") {
    if (value === undefined || value === null || value === "") return;
    const line = document.createElement("div");
    if (className) line.className = className;
    line.textContent = flatten(value);
    container.append(line);
  }

  function appendUnlabeledDetail(list, value) {
    if (value === undefined || value === null || value === "") return;
    const row = document.createElement("div");
    const detail = document.createElement("dd");
    detail.textContent = flatten(value);
    row.append(detail);
    list.append(row);
  }

  function updateTypeControls() {
    const typeFilters = [...document.querySelectorAll(".type-filter [data-category], .type-filter [data-weapon-subtype]")];
    const hasSelection = typeFilters.some(input => input.checked);
    for (const input of typeFilters) {
      input.closest("label").classList.toggle("is-unselected", hasSelection && !input.checked);
    }
  }

  async function renderResultGroups(shownItems, isDefault, selectedCategories, renderId) {
    resultsList.replaceChildren();

    const groups = new Map();
    const groupName = item => {
      if (isDefault) return "Most Recently Discovered";
      const matchingEquipmentCategories = Object.keys(equipmentGroupNames)
        .filter(category => categoryMatches[category](item));
      const equipmentCategory = selectedCategories.find(category => (
        matchingEquipmentCategories.includes(category)
      )) || (matchingEquipmentCategories.length === 1 ? matchingEquipmentCategories[0] : null);
      return equipmentGroupNames[equipmentCategory] || item.group || "Other";
    };
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

    let renderedItems = 0;
    for (const [group, groupItems] of groups) {
      const section = document.createElement("details");
      section.className = "result-group";
      section.dataset.group = group;
      section.open = true;

      const heading = document.createElement("summary");
      heading.textContent = `${group} (${groupCounts.get(group)})`;
      section.append(heading);

      const content = document.createElement("div");
      content.className = "result-group-items";
      for (const item of groupItems) {
        content.append(createItemCard(item, isDefault));
        renderedItems += 1;
        if (shownItems.length > renderBatchSize && renderedItems % renderBatchSize === 0) {
          if (!section.isConnected) {
            section.append(content);
            resultsList.append(section);
          }
          await new Promise(requestAnimationFrame);
          if (renderId !== activeRenderId) return;
        }
      }
      if (!section.isConnected) {
        section.append(content);
        resultsList.append(section);
      }
    }
  }

  async function render() {
    const renderId = ++activeRenderId;
    const { results, isDefault, selectedCategories } = filterItems();
    isDefaultResults = isDefault;
    const displayedResults = isDefault
      ? [...results]
        .sort((a, b) => dateAddedTimestamp(b) - dateAddedTimestamp(a))
        .slice(0, 100)
      : results;
    filteredItems = isDefault ? displayedResults : sortItems(displayedResults);
    resultCount.textContent = `${filteredItems.length.toLocaleString()} item${filteredItems.length === 1 ? "" : "s"} found`;
    noResults.hidden = filteredItems.length !== 0;
    loadError.hidden = true;
    const shouldShowLoading = filteredItems.length > renderBatchSize;
    resultsList.setAttribute("aria-busy", String(shouldShowLoading));

    try {
      if (shouldShowLoading) await new Promise(requestAnimationFrame);
      if (renderId !== activeRenderId) return;
      await renderResultGroups(filteredItems, isDefaultResults, selectedCategories, renderId);
    } catch (error) {
      if (renderId !== activeRenderId) return;
      loadError.textContent = error instanceof Error ? error.message : "An unexpected error occurred while displaying results.";
      loadError.hidden = false;
    } finally {
      if (renderId === activeRenderId) {
        resultsList.setAttribute("aria-busy", "false");
      }
    }
  }

  async function loadData() {
    try {
      const [response, locationsResponse] = await Promise.all([
        fetch(app.dataset.itemsUrl),
        fetch(app.dataset.mobLocationsUrl)
      ]);
      if (!response.ok) throw new Error(`Item data request failed (${response.status}).`);
      if (!locationsResponse.ok) throw new Error(`Mob location data request failed (${locationsResponse.status}).`);
      const [data, locations] = await Promise.all([response.json(), locationsResponse.json()]);
      if (!Array.isArray(data.items)) throw new Error("Item data does not contain an items array.");
      if (!locations || typeof locations !== "object" || Array.isArray(locations)) {
        throw new Error("Mob location data is not a VNUM lookup.");
      }
      for (const [vnum, location] of Object.entries(locations)) {
        if (!/^\d+$/.test(vnum) || !location || typeof location.name !== "string"
          || typeof location.area !== "string" || typeof location.continent !== "string") {
          throw new Error(`Mob location data contains an invalid entry for VNUM ${vnum}.`);
        }
      }
      items = data.items;
      mobLocations = new Map(Object.entries(locations));
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
    if (event.target.matches("[data-category], [data-weapon-subtype]")) updateTypeControls();
    updateUrl();
    render();
  });
  form.addEventListener("click", event => {
    const checkbox = event.target.closest(".tri-state-checkbox");
    if (!checkbox) return;
    const filter = checkbox.closest("[data-tristate]").dataset.tristate;
    const states = ["any", "yes", "no"];
    const nextState = states[(states.indexOf(checkbox.dataset.state) + 1) % states.length];
    setTriState(filter, nextState);
    updateUrl();
    render();
  });
  resultsList.addEventListener("click", event => {
    const link = event.target.closest("a[data-search-query]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, "", link.href);
    applyUrlState();
    updateTypeControls();
    render();
    searchInput.focus();
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
    updateTypeControls();
    render();
  });
  form.addEventListener("reset", () => {
    clearTimeout(searchTimer);
    sortControl.querySelector('input[value="ac"]').checked = true;
    requestAnimationFrame(() => {
      for (const filter of triStateFilters) {
        setTriState(filter, filter === "hidden" ? "no" : "any");
      }
      updateTypeControls();
      updateUrl();
      render();
    });
  });

  applyUrlState();
  updateTypeControls();
  updateUrl();
  loadData();
})();
