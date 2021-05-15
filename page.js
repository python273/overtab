const rootEl = document.querySelector('#root');

document.querySelectorAll('form').forEach(el => {
    el.addEventListener('submit', event => {
        event.preventDefault();
    });
});

const tabElId = (tabId) => `tab_${tabId}`;

function getTabIdFromEvent(event) {
    return parseInt(event.target.closest('.tab').dataset['id'], 10);
}

async function onTabClick(event) {
    event.preventDefault();
    const tabId = getTabIdFromEvent(event);
    await browser.tabs.update(tabId, {active: true, highlighted: false});
}

async function onTabAuxclick(event) {
    if (event.which !== 2) return;

    event.preventDefault();
    const tabId = getTabIdFromEvent(event);
    await browser.tabs.remove(tabId);
}

/*
async function highlightTab(event) {
    const tabId = getTabIdFromEvent(event);
    await browser.tabs.update(tabId, {active: false, highlighted: true});
}

async function unhighlightTab(event) {
    const tabId = getTabIdFromEvent(event);
    await browser.tabs.update(tabId, {active: false, highlighted: false});
}
*/

function closeAllTabPopovers() {
    const els = document.querySelectorAll('.tabPopover');
    for (const el of els) {
        el.remove();
    }
}


async function showTabPopover(event) {
    const tabId = getTabIdFromEvent(event);
    const tab = await browser.tabs.get(tabId);

    const tabEl = document.getElementById(tabElId(tabId));

    const pos = tabEl.getBoundingClientRect();

    const el = document.createElement('div');
    el.id = `tab_popover_${tabId}`;
    el.classList.add("tabPopover");
    el.style['position'] = 'absolute';
    el.style['top'] = `${pos.top + pos.height + window.scrollY}px`;
    el.style['left'] = `${pos.left + window.scrollX}px`;

    const elTitle = document.createElement('div');
    elTitle.classList.add("tabPopoverTitle");
    elTitle.innerText = tab.title;
    el.appendChild(elTitle);

    const elUrl = document.createElement('div');
    elUrl.innerText = tab.url;
    el.appendChild(elUrl);

    el.addEventListener('mouseenter', () => {
        if (popoverTimeoutId) {
            clearTimeout(popoverTimeoutId);
        }
    })

    closeAllTabPopovers();
    document.body.appendChild(el);
}

let popoverTimeoutId;

async function closeTabPopover(event) {
    const tabId = getTabIdFromEvent(event);

    popoverTimeoutId = setTimeout(async () => {
        const el = document.getElementById(`tab_popover_${tabId}`);
        if (el) {
            el.remove();
        }
    }, 250);
}

const createTabEl = (tab) => {
    const tabEl = document.createElement('div');
    tabEl.id = tabElId(tab.id);
    tabEl.dataset['id'] = tab.id;
    tabEl.classList.add("tab");
    // if (tab.active) tabEl.classList.add("tabActive");
    // if (tab.highlighted) tabEl.classList.add("tabHighlighted");

    if (tab.favIconUrl) {
        const tabIcon = document.createElement('img');
        tabIcon.classList.add("tabIcon");
        tabIcon.src = tab.favIconUrl;
        tabEl.appendChild(tabIcon);
    }

    const tabTitle = document.createElement('span');
    tabTitle.classList.add("tabTitle");
    tabTitle.innerText = tab.title;
    tabEl.appendChild(tabTitle);

    tabEl.addEventListener('click', onTabClick);
    tabEl.addEventListener('auxclick', onTabAuxclick);
    tabEl.addEventListener('mouseenter', showTabPopover);
    tabEl.addEventListener('mouseleave', closeTabPopover);

    return tabEl;
}

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // console.log(tabId, changeInfo, tab);

    const newTabEl = createTabEl(tab);
    var currentTabEl = document.getElementById(tabElId(tabId));
    currentTabEl.parentElement.replaceChild(newTabEl, currentTabEl);

    // renderTabs().then(() => {});
});

browser.tabs.onRemoved.addListener((tabId) => {
    const selectorsToRemove = [
        '#' + tabElId(tabId),
        '#' + `tab_popover_${tabId}`,
    ];
    for (const s of selectorsToRemove) {
        const els = document.querySelectorAll(s);
        for (const el of els) {
            el.remove();
        }
    }
})

async function _renderTabs() {
    let tabs = await browser.tabs.query({});

    if (query) {
        let newTabs = [];

        for (let tab of tabs) {
            let tabMatching = false;

            if (queryIsRegex) {
                tabMatching = (
                    (tab.title && queryRegexp.test(tab.title)) ||
                    (tab.url && queryRegexp.test(tab.url))
                );
            } else {
                tabMatching = (
                    (tab.title && tab.title.indexOf(query) >= 0) ||
                    (tab.url && tab.url.indexOf(query) >= 0)
                );
            }
            if (!tabMatching) continue;
            
            newTabs.push(tab);
        }

        tabs = newTabs;
    }

    if (sortByUrl) {
        tabs.sort((a, b) => a.url.localeCompare(b.url));
    } else {
        tabs.sort((a, b) => a.index - b.index);
    }

    const tabsByWindows = {};

    for (let tab of tabs) {
        let windowTabs = null;

        if (!tabsByWindows.hasOwnProperty(tab.windowId)) {
            windowTabs = [];
            tabsByWindows[tab.windowId] = windowTabs;
        } else {
            windowTabs = tabsByWindows[tab.windowId];
        }

        windowTabs.push(tab);
    }

    const windowsEl = document.createElement('div');
    windowsEl.id = "windows";

    for(let windowId in tabsByWindows) {
        const windowTabs = tabsByWindows[windowId];

        const windowEl = document.createElement('div');
        windowEl.classList.add("window");
        windowsEl.appendChild(windowEl);

        for (let tab of windowTabs) {
            const tabEl = createTabEl(tab);
            windowEl.appendChild(tabEl);
        }
    }

    rootEl.replaceChildren(windowsEl);
}

let rendering = false;
let shouldRenderAgain = false;

async function renderTabs() {
    if (rendering) {
        shouldRenderAgain = true;
        return;
    }

    rendering = true;
    let first = true;

    while (first || shouldRenderAgain) {
        shouldRenderAgain = false;
        await _renderTabs();
        first = false;
    }
    rendering = false;
}

browser.tabs.onCreated.addListener((tabId) => {
    renderTabs().then(() => {});
})


let query = '';
let queryRegexp = '';

function onQueryInputChange(event) {
    closeAllTabPopovers();

    query = event.target.value.trimStart();
    queryRegexp = new RegExp(query, 'ig');

    renderTabs().then(() => {});
}

document.getElementById('queryInput').addEventListener('input', onQueryInputChange);

let sortByUrl = false;

function onSortChange(event) {
    closeAllTabPopovers();
    sortByUrl = event.target.checked;
    renderTabs().then(() => {});
}

document.getElementById('sortByUrl').addEventListener('change', onSortChange);
document.getElementById('sortByUrl').checked = false;

let queryIsRegex = false;

function onQueryIsRegexChange(event) {
    closeAllTabPopovers();
    queryIsRegex = event.target.checked;
    renderTabs().then(() => {});
}

document.getElementById('queryIsRegex').addEventListener('change', onQueryIsRegexChange);
document.getElementById('queryIsRegex').checked = false;

// function onKeyupHotkey(event) {
//     console.log(event);
// }
// window.addEventListener('keyup', onKeyupHotkey);

renderTabs().then(()=>{});
