///<reference path="formmenu.d.ts" />

// "DOMContentLoaded" fires when the html has loaded, even if the stylesheets, javascript, etc are still being loaded.
// "load" fires when the entire page has loaded, including stylesheets, etc.

document.addEventListener("DOMContentLoaded", function(){
    FormMenu.pageLoadedHandler();
});

document.addEventListener('scroll', function () {
    FormMenu.scrollHandler();
}, {
    passive: true
});

// The resize event only gets triggered on the window object, and doesn't bubble.
// See https://developer.mozilla.org/en-US/docs/Web/API/Window/resize_event
window.addEventListener("resize", function(){
    FormMenu.resizeHandler();
});

namespace FormMenu {
    const _levelNonHeadingMenuItem: number = 9000;

    let defaultConfiguration: iFormMenuConfiguration = {
        skipFirstHeading: false,

        // Items with level equal or lower than this will be open initially. -1 to open everything. 0 to open nothing.
        defaultOpenAtLevel: _levelNonHeadingMenuItem + 1,

        // Same as defaultOpenAtLevel, but applies when user clicks the collapse filter button.
        collapseOpenAtLevel: 1,

        minimumMenuWidth: 60,
        minimumMenuHeigth: 60,
        fixedHeight: false,

        showFilterInput: true,
        filterPlaceholder: 'filter',
        filterMinimumCharacters: 2,
        showMenuHideShowButton: true,
        showExpandAllMenuButton: true,
        showCollapseAllMenuButton: true,

        // Note that HTML only has these heading tags. There is no h7, etc.
        querySelector: "h1,h2,h3,h4,h5,h6",

        tagNameToLevelMethod: tagNameToLevelDefaultMethod,
        itemStateInfos: {},
        menuButtons: {}
    }

    // Create empty formMenuConfiguration here, to make it easier to write
    // ...formmenu.config.js files that set properties on this object.
    //
    // Do not use let here, because that doesn't allow you to declare a variable 
    // multiple times.
    export var formMenuConfiguration: iFormMenuConfiguration = {};

    class MenuElementInfo {

        constructor(
            // The heading, etc. in the actual DOM (not in the menu)
            public domElement: HTMLElement,

            // Caption of the menu element
            public caption: string,

            // Level of the menu item. For example, a H1 has level 1, H2 has level 2.
            // Menu items that are not associated with a heading have a very high level.
            public level: number
        ) {}

        // The item in the menu
        public menuElement: HTMLElement;

        // Headings constitute a hierarchy. An H2 below an H1 is the child of that H1.
        // non-headings are children of the heading they sit under.
        public parent: MenuElementInfo;
        public children: MenuElementInfo[] = [];

        // If this element has children, then if true the element is expanded
        public isExpanded: boolean = false;

        // true if the menuElement (the dom menu item) is included in the menu. That is, if any filters are active,
        // it passed those filters. 
        // Note that the menu item could be still not visible to the user even if this is true, because its parent was closed,
        // because it is scrolled out of the menu div visible area.
        public isIncludedInMenu: boolean = false;

        // Contains all item state infos that are active for this element
        public itemStates: iItemStateInfo[] = [];
    }

    let _menuElementInfos: MenuElementInfo[];

    // Acts as the parent of menu elements with the lowest level (typically the h1)
    // Use the children property of this element to easily generate the ul tag
    // containing the menu items.
    // Must have a level lower than 1.
    let _menuElementInfosRoot: MenuElementInfo = new MenuElementInfo(null, null, 0);

    // The div that contains the entire menu
    let _mainMenuElement:HTMLElement;

    // The div that contains the entire menu
    let _mainUlElement:HTMLUListElement;

    // The current content of the search box
    let _searchTerm:string = '';

    // Holds references to all iItemStateInfos whose filers are active
    let _itemStateInfoActiveFilters: iItemStateInfo[] = [];

    // Used to determine in which direction the page is scrolling
    let _lastPageYOffset: number = 0;

    // If true, we're scrolling towards the end of the document
    let _scrollingDown = true;

    function searchFilterIsActive(): boolean {
        const filterValue = _searchTerm;
        const filterMinimumCharacters: number = getConfigValue("filterMinimumCharacters");

        // Filter is active if there is a filter value, and there are enough filter characters.
        const filterIsActive = (filterValue && (filterValue.length >= filterMinimumCharacters));

        return filterIsActive;
    }

    function tagNameToLevelDefaultMethod(tagName: string): number {
        switch (tagName.toLowerCase()) {
            case 'h1': return 1;
            case 'h2': return 2;
            case 'h3': return 3;
            case 'h4': return 4;
            case 'h5': return 5;
            case 'h6': return 6;
            default: return _levelNonHeadingMenuItem;
          }
    }

    function tagNameToLevel(tagName: string): number {
        let tagNameToLevelMethod: (tagName: string) => number = getConfigValue("tagNameToLevelMethod");
        let level:number = tagNameToLevelMethod(tagName);
        return level;
    }

    function getConfigValue(itemName: string): any {
        // formMenuConfiguration may have been created by loading .js file that defines that variable.
        // First try to get the value from there. Otherwise get it from the default config.
        // Note that you want to check against undefined specifically, because for example false
        // is a valid value.

        // Do not use "if (formMenuConfiguration)", because then you'll get a run time reference error
        // if the variable does not exist already.
        if (typeof formMenuConfiguration !== 'undefined') {
            if (typeof formMenuConfiguration[itemName] !== 'undefined') {
                return formMenuConfiguration[itemName];
            }
        }

        return defaultConfiguration[itemName]; 
    }

    // Returns all dom elements to be represented in the menu
    function getAllDomElements(): NodeListOf<Element> {
        let querySelector: string = getConfigValue("querySelector");

        let allDomElements = document.querySelectorAll(querySelector);
        return allDomElements;
    }

    // Converts a list of heading tags to MenuElements.
    // Skips the first heading if config item skipFirstHeading is true.
    function domElementsToMenuElements(domElements: NodeListOf<Element>): MenuElementInfo[] {
        let _menuElementInfos: MenuElementInfo[] = [];

        let includeElement: boolean = !getConfigValue("skipFirstHeading");

        domElements.forEach((value: Element)=>{
            if (includeElement) { _menuElementInfos.push(domElementToMenuElement(value as HTMLElement)); }
            includeElement = true;
        });

        return _menuElementInfos;
    }

    function domElementToMenuElement(domElement: HTMLElement): MenuElementInfo {
        let menuElementClass = 'formmenu-' + domElement.tagName;
        let caption = domElement.innerText;

        // If a menu item gets clicked, scroll the associated dom element into view if it is not already
        // visible. If it is already visible, do not scroll it.
        //
        // Also give it the formmenu-highlighted-dom-item for a short time, to point out where
        // it is.
        let onClickHandler = (e:MouseEvent)=>{

            if (elementIsVisible(domElement) !== 0) {
                domElement.scrollIntoView();
            }

            // See https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Animations/Using_CSS_animations
            domElement.addEventListener("animationend", 
                function(){ domElement.classList.remove('formmenu-highlighted-dom-item'); }, false);
            domElement.classList.add('formmenu-highlighted-dom-item');
        };

        let level:number = tagNameToLevel(domElement.tagName);
        let menuElementInfo = new MenuElementInfo(
            domElement,
            caption,
            level);

        let menuElementDiv = createMenuElementDiv(menuElementInfo, menuElementClass, onClickHandler);
        menuElementInfo.menuElement = menuElementDiv;

        let defaultOpen: boolean = openByDefault(menuElementInfo, "defaultOpenAtLevel");
        menuElementInfo.isExpanded = defaultOpen;

        return menuElementInfo;
    }

    // Sets the parent property in all elements in _menuElementInfos.
    // parent: set to _menuElementInfosRoot
    // i: set to 0
    function setParents(parent: MenuElementInfo, i: { value:number}, _menuElementInfos: MenuElementInfo[]): void {
        const parentLevel: number = parent.level;

        while((i.value < _menuElementInfos.length) && (_menuElementInfos[i.value].level > parentLevel)) {

            let currentMenuElementInfo = _menuElementInfos[i.value];
            currentMenuElementInfo.parent = parent;

            if (parent) { parent.children.push(currentMenuElementInfo); }

            // Point to first potential child item
            i.value = i.value + 1;

            setParents(currentMenuElementInfo, i, _menuElementInfos);
        }
    }

    // If the element has class1, sets class2 instead. And vice versa.
    function toggleClasses(htmlElement:HTMLElement, class1: string, class2: string): void {
        if (htmlElement.classList.contains(class1)) {
            htmlElement.classList.remove(class1);
            htmlElement.classList.add(class2);
        } else if (htmlElement.classList.contains(class2)) {
            htmlElement.classList.remove(class2);
            htmlElement.classList.add(class1);
        }
    }

    // If the element has cssClass, remove it. Otherwise add it.
    function toggleClass(htmlElement:HTMLElement, cssClass: string): void {
        if (htmlElement.classList.contains(cssClass)) {
            htmlElement.classList.remove(cssClass);
        } else {
            htmlElement.classList.add(cssClass);
        }
    }

    function setClass(htmlElement:HTMLElement, setIt: boolean, cssClass: string): void {
        htmlElement.classList.remove(cssClass);
        if (setIt) {
            htmlElement.classList.add(cssClass);
        }
    }

    // If there is a local storage item with the given key, removes it.
    // Otherwise adds it with a non-falsy value.
    function toggleLocalStorage(key: string) {
        if (localStorage.getItem(key)) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, "1");
        }
    }

    function parentOfEventTarget(e:MouseEvent): HTMLElement {
        // See https://developer.mozilla.org/en-US/docs/Web/API/Event/currentTarget
        // currentTarget will return the span containing the caption.

        let parent:HTMLElement = (<any>(e.currentTarget)).parentNode;
        return parent;
    }

    // Returns if by default the menu item should be open, false otherwise.
    // levelConfigItemName - name of config item that has the level at which the item should be open
    function openByDefault(menuElementInfo: MenuElementInfo, levelConfigItemName: string): boolean {
        const levelConfig: number = getConfigValue(levelConfigItemName);
        const result = ((menuElementInfo.level <= levelConfig) || (levelConfig == -1));

        return result;
    }

    function onExpandClicked(menuElementInfo: MenuElementInfo) {
        toggleClass(menuElementInfo.menuElement, 'formmenu-item-open')
        menuElementInfo.isExpanded = !menuElementInfo.isExpanded;
        ensureMenuBottomVisible();
    }

    function createMenuElementDiv(menuElementInfo: MenuElementInfo, cssClass: string, onClickHandler: (e:MouseEvent)=>void): HTMLElement {
        let menuElement: HTMLElement = document.createElement("div");

        let expandElement: HTMLAnchorElement = document.createElement("a");
        expandElement.href = "#";
        expandElement.classList.add("formmenu-expand");
        expandElement.onclick = (e) => onExpandClicked(menuElementInfo);
        menuElement.appendChild(expandElement);

        let captionElement: HTMLElement = document.createElement("span");
        captionElement.classList.add("formmenu-caption");
        captionElement.innerHTML = menuElementInfo.caption;
        captionElement.onclick = onClickHandler;
        menuElement.appendChild(captionElement);

        menuElement.classList.add(cssClass);
        menuElement.classList.add("formmenu-item");

        return menuElement;
    }

    // Gets the span with the caption from a MenuElementInfo
    function getCaptionElement(menuElementInfo: MenuElementInfo): HTMLElement {
        const divElement: HTMLElement = menuElementInfo.menuElement;
        const captionSpanElement: HTMLElement = <HTMLElement>(divElement.children[1]);

        return captionSpanElement;
    }

    // Inserts span tags into a string. The start tag will be at startIndex and the end tag
    // spanLength characters later.
    // For example:
    // s: abcdefgi, startIndex: 2, spanLength: 3
    // Result:
    // ab<span class='formmenu-matching-filter-text'>cde</span>fgi
    function insertMatchingFilterTextSpan(s: string, startIndex: number, spanLength: number): string {
        const part1 = s.substring(0, startIndex);
        const part2 = s.substring(startIndex, startIndex + spanLength);
        const part3 = s.substring(startIndex + spanLength);

        const result = part1 + "<span class='formmenu-matching-filter-text'>" + part2 + "</span>" + part3;
        return result;
    }

    function onChangeFilter(e: Event): void {
        _searchTerm = (<HTMLInputElement>(e.currentTarget)).value;
        
        setClass(_mainMenuElement, searchFilterIsActive(), 'formmenu-textmatch-filter-is-active');

        rebuildMenuList();
    }

    function createFilterInput(): HTMLInputElement {
        let menuElement: HTMLInputElement = document.createElement("input");
        menuElement.type = "search";
        menuElement.className = 'formmenu-filter';

        let filterPlaceholder = getConfigValue("filterPlaceholder");
        if (filterPlaceholder) {
            menuElement.placeholder = filterPlaceholder;
        }

        // onChange only fires after you've clicked outside the input box.
        // onKeypress fires before the value has been updated, so you get the old value, not the latest value
        menuElement.onkeyup = onChangeFilter;

        // onfilter fires when the little clear icon is clicked
        (<any>menuElement).onsearch = onChangeFilter;

        return menuElement;
    }

    function setMenuHeight(height: number): void {
        const fixedHeight: boolean = getConfigValue('fixedHeight');

        if (fixedHeight) {
            _mainMenuElement.style.height = height + "px";
        } else {
            _mainMenuElement.style.maxHeight = height + "px";
            _mainMenuElement.style.bottom = "auto";
        }
    }

    function storeDimensions(width: number, height: number): void {
        localStorage.setItem('formmenu-width', width.toString());
        localStorage.setItem('formmenu-height', height.toString());
    }

    function getDimensions(): { width: number, height: number } {
        const result = { 
            width: parseInt(localStorage.getItem('formmenu-width')), 
            height: parseInt(localStorage.getItem('formmenu-height')) 
        };

        return result;
    }

    function setDimensionsFromLocalStorage(): void {
        let dimensions = getDimensions();

        if (!isNaN(dimensions.width)) {
            _mainMenuElement.style.width = dimensions.width + "px";
        }

        if (!isNaN(dimensions.height)) {
            setMenuHeight(dimensions.height);
        }
    }

    // If the user resizes the windows, reducing it height, at some point the menu
    // will start extending below the bottom of the window. So its bottom is no longer
    // visible. Ensures this doesn't happen by removing
    // the height or max-height property; and
    // the bottom: auto property.
    // This allows the stylesheet to take over. If this sets top and bottom of the main menu
    // element, that will lead to both top and bottom of the menu being visible.
    function ensureMenuBottomVisible(): void {

    }

    function hideMenu(): void {
        _mainMenuElement.classList.add('formmenu-hidden');
        localStorage.setItem('formmenu-hidden', "1");
    }

    function onMenuHideShowButtonClicked(e: MouseEvent): void {
        toggleClass(_mainMenuElement, 'formmenu-hidden');
        toggleLocalStorage('formmenu-hidden');
    }

    function onExpandAllMenuClicked(e: MouseEvent): void {
        _menuElementInfos.forEach((menuElementInfo:MenuElementInfo) => {
            menuElementInfo.isExpanded = true;
        });

        rebuildMenuList();
    }

    function onCollapseAllMenuClicked(e: MouseEvent): void {
        _menuElementInfos.forEach((menuElementInfo:MenuElementInfo) => {
            let defaultOpen: boolean = openByDefault(menuElementInfo, "collapseOpenAtLevel");

            // Close the items above the "collapseOpenAtLevel" level
            // Leave alone those items that could be opened. That way, if the user has closed
            // more items than this method would close, clicking collapse won't lead to actually
            // items being opened.

            if (!defaultOpen) {
                menuElementInfo.isExpanded = false;
            }
        });

        rebuildMenuList();
    }

    // Add a filter button to the filter bar (the bit of space left of the filter).
    // cssClass - css class of the span representing the button.
    // onClickHandler - runs when button is clicked.
    // showHideConfigName - name of a config item. If blank, button is always created.
    //                      If not blank, config item has to be true for button to be created.
    // parent - filter button will be added to this element.
    //
    function addFilterButton(cssClass: string, onClickHandler: (e: MouseEvent) => void,
        showHideConfigName: string, parent: HTMLElement) {

        let showButton: boolean = true;
        
        if (showHideConfigName) {
            showButton = getConfigValue(showHideConfigName);
        }
        
        if (!showButton) {
            return;
        }

        let filterButton: HTMLElement = createFilterButton(cssClass, onClickHandler);
        parent.appendChild(filterButton);
    }

    function createFilterButton(cssClass: string, onClickHandler: (e: MouseEvent) => void): HTMLButtonElement {
        let filterButton: HTMLButtonElement = document.createElement("button");
        filterButton.type = "button";
        filterButton.classList.add('formmenu-filter-button-outer');

        let filterButtonSpan: HTMLElement = document.createElement("span");
        filterButtonSpan.classList.add(cssClass);
        filterButtonSpan.classList.add('formmenu-filter-button');

        filterButton.appendChild(filterButtonSpan);

        filterButton.onclick = onClickHandler;

        return filterButton;
    }

    function createMainMenuElement(): HTMLElement {
        let menuElement: HTMLElement = document.createElement("div");
        menuElement.classList.add('formmenu');
        menuElement.id = 'formmenu';

        return menuElement;
    }

    function addMenuBody(_mainMenuElement: HTMLElement, _menuElementInfos: MenuElementInfo[]): void {
        let openButtonBar: HTMLElement = document.createElement("div");
        openButtonBar.classList.add('formmenu-open-button-bar');

        addFilterButton('formmenu-menu-hide-show', onMenuHideShowButtonClicked,
            "showMenuHideShowButton", openButtonBar);

        _mainMenuElement.appendChild(openButtonBar);

        let filterBar: HTMLElement = document.createElement("div");
        filterBar.classList.add('formmenu-filter-bar');

        addFilterButton('formmenu-menu-hide-show', onMenuHideShowButtonClicked,
            "showMenuHideShowButton", filterBar);

        addFilterButton('formmenu-expand-all-menu-button', onExpandAllMenuClicked,
            "showExpandAllMenuButton", filterBar);

        addFilterButton('formmenu-collapse-all-menu-button', onCollapseAllMenuClicked,
            "showCollapseAllMenuButton", filterBar);

        // Create the buttons area very early on, in case processing of the item state infos
        // or the rebuilding of the menu itself
        // has a dependency on the buttons.
        const buttonsArea:HTMLDivElement = createButtonsArea();

        processAllItemStateInfos(filterBar, _menuElementInfos);

        let showFilterInput: boolean = getConfigValue("showFilterInput");
        if (showFilterInput) {
            let filterInput = createFilterInput();
            filterBar.appendChild(filterInput);
        }

        _mainMenuElement.appendChild(filterBar);

        // The the ul holding the menu items must have the class formmenu-top-menuitems.
        // It will be replaced by rebuildMenuList.
        _mainUlElement = document.createElement("ul");
        _mainMenuElement.appendChild(_mainUlElement);

        // Create buttons area
        _mainMenuElement.appendChild(buttonsArea);

        rebuildMenuList();
    }

    function visitAllItemStateInfos(callback: (itemStateInfo: iItemStateInfo)=>void): void {
        visitKeyedConfigItems<iItemStateInfo>("itemStateInfos", callback);
    }

    function visitAllMenuButtonInfos(callback: (menuButtonInfo: iMenuButton)=>void): void {
        visitKeyedConfigItems<iMenuButton>("menuButtons", callback);
    }

    function visitKeyedConfigItems<T>(configValueName: string, callback: (configItem: T)=>void): void {
        let configItems: { [key: string]: T} = getConfigValue(configValueName);

        Object.keys(configItems).forEach(key => {
            callback(configItems[key]);
        });
    }

    // Creates a button area div. Visits all menu button infos
    // and adds the button to the button area div. Returns the button area div.
    function createButtonsArea(): HTMLDivElement {

        let buttonArea: HTMLDivElement = document.createElement("div");
        buttonArea.classList.add('formmenu-buttonarea');
        buttonArea.id = 'formmenu-buttonarea';

        visitAllMenuButtonInfos((menuButtonInfo: iMenuButton)=>{
            let button: HTMLButtonElement = document.createElement("button");

            button.type = "button";
            button.innerHTML = menuButtonInfo.caption;
            button.onclick = menuButtonInfo.onClick;

            if (menuButtonInfo.cssClass) {
                const cssClasses: string[] = menuButtonInfo.cssClass.split(' ');
                for (let i = 0; i < cssClasses.length; i++) {
                    button.classList.add(cssClasses[i]);
                }
            }

            if (menuButtonInfo.wireUp) {
                menuButtonInfo.wireUp(button);
            }

            buttonArea.appendChild(button);
        })

        const resizeIcon = neResizeDiv();
        buttonArea.appendChild(resizeIcon);

        return buttonArea;
    }

    function neResizeDiv(): HTMLDivElement {
        let resizeIcon: HTMLDivElement = document.createElement("div");
        resizeIcon.classList.add('formmenu-resize-icon');

        resizeIcon.addEventListener('mousedown', function(e) {
            e.preventDefault();

            const boundingRect = _mainMenuElement.getBoundingClientRect();
            const preMoveX = boundingRect.left;
            const preMoveWidth = boundingRect.right - boundingRect.left;
            const preMoveHeight = boundingRect.bottom - boundingRect.top;
            const preMoveMouseX = e.pageX;
            const preMoveMouseY = e.pageY;

            const resizeMenu = (e) => {
                            
                let newWidth = preMoveWidth - (e.pageX - preMoveMouseX);
                let newHeight = preMoveHeight + (e.pageY - preMoveMouseY);

                storeDimensions(newWidth, newHeight);

                const minimumMenuWidth: number = getConfigValue('minimumMenuWidth');
                const minimumMenuHeigth: number = getConfigValue('minimumMenuHeigth');

                if ((newWidth < minimumMenuWidth) || (newHeight < minimumMenuHeigth)) {
                    window.removeEventListener('mousemove', resizeMenu);
                    hideMenu();
                    return;
                }

                let newX = preMoveX - (newWidth - preMoveWidth);

                _mainMenuElement.style.left = newX + "px";
                _mainMenuElement.style.width = newWidth + "px";
                setMenuHeight(newHeight);
            };

            window.addEventListener('mousemove', resizeMenu);

            window.addEventListener('mouseup', ()=> {
                window.removeEventListener('mousemove', resizeMenu);
            });
        });

        return resizeIcon;
    }

    // Visits all item state infos, processes the menu element infos for each
    // and adds a filter button for each to the passed in filter bar. 
    function processAllItemStateInfos(filterBar: HTMLElement, _menuElementInfos: MenuElementInfo[]): void {
        visitAllItemStateInfos((itemStateInfo: iItemStateInfo)=>{
            processItemStateInfo(itemStateInfo, filterBar, _menuElementInfos);
        });
    }

    // Returns true if the given item state is active
    function getItemStateStatus(itemStateInfo: iItemStateInfo): boolean {
        const idx:number = _itemStateInfoActiveFilters.indexOf(itemStateInfo);
        return (idx !== -1);
    }

    // Sets the state of the given item state filter.
    // active - true to set active (so menu items are filtered), false to set inactive
    // filterButton - filter button associated with the item state
    function setItemStateStatus(active: boolean, itemStateInfo: iItemStateInfo, filterButton:HTMLElement): void {
        setClass(_mainMenuElement, active, itemStateInfo.stateFilterActiveClass);
        setClass(filterButton, active, 'formmenu-filter-button-depressed');

        // Update _itemStateInfoActiveFilters array

        let idx:number = _itemStateInfoActiveFilters.indexOf(itemStateInfo);

        if (idx != -1) {
            _itemStateInfoActiveFilters.splice(idx, 1);
        }
        
        if (active) {
            _itemStateInfoActiveFilters.push(itemStateInfo);
        }
    }

    function onItemStateFilterButtonClicked(e: MouseEvent, itemStateInfo: iItemStateInfo): void {
        let clickedElement:HTMLElement = (<any>(e.currentTarget));
    //###########    if (clickedElement.classList.contains('formmenu-filter-button-disabled')) { return; }

        const itemStateActive: boolean = getItemStateStatus(itemStateInfo);
        setItemStateStatus(!itemStateActive, itemStateInfo, clickedElement);

        rebuildMenuList();
    }

    // Called when the item state of a menu item is updated
    function setItemStateActive(active: boolean, itemStateInfo: iItemStateInfo, filterButton: HTMLButtonElement, 
        menuElementInfo: MenuElementInfo): void {

        let itemStates = menuElementInfo.itemStates;
        let idx:number = itemStates.indexOf(itemStateInfo);

        if (idx != -1) {
            itemStates.splice(idx, 1);
        }
        
        if (active) {
            itemStates.push(itemStateInfo);
        }
    
        // Update the menu element
        setClass(menuElementInfo.menuElement, active, itemStateInfo.hasActiveStateClass);

        // Update filter button style

        let existsActiveItem = active;
        if (!existsActiveItem) {
            _menuElementInfos.forEach((menuElementInfo:MenuElementInfo) => {
                if (menuElementInfo.itemStates.indexOf(itemStateInfo) != -1) {
                    existsActiveItem = true;
                }
            });
        }

        if (itemStateInfo.onChangeMenuItemsWithItemStateExist) {
            itemStateInfo.onChangeMenuItemsWithItemStateExist(existsActiveItem);
        }

 //##########       setClass(filterButton, !existsActiveItem, 'formmenu-filter-button-disabled');
        filterButton.disabled = !existsActiveItem;

        if (!existsActiveItem) {
            setItemStateStatus(false, itemStateInfo, filterButton);
        }

        rebuildMenuList();
    }

    function processItemStateInfo(itemStateInfo: iItemStateInfo, filterBar: HTMLElement, 
        _menuElementInfos: MenuElementInfo[]): void {

        let filterButton: HTMLButtonElement = createFilterButton(
            itemStateInfo.stateFilterButtonClass, (e: MouseEvent) => { onItemStateFilterButtonClicked(e, itemStateInfo); });
        filterButton.disabled = true;
        filterBar.appendChild(filterButton);

        _menuElementInfos.forEach((menuElementInfo:MenuElementInfo) => {
            itemStateInfo.wireUp(menuElementInfo.domElement,
                (active: boolean)=>setItemStateActive(active, itemStateInfo, filterButton, menuElementInfo));
        });
    }

    // If the element is visible, returns 0.
    // If it is not visible, returns distance from top of screen to top of element.
    // This will be negative if the element is above the screen. The more negative it is, the higher it is
    // (as in, the further away from the screen.)
    function elementIsVisible(element: HTMLElement): number {
        const boundingRectangle = element.getBoundingClientRect();

        const isVisible = (
            (boundingRectangle.top >= 0) &&
            (boundingRectangle.left >= 0) &&
            (boundingRectangle.bottom <= (window.innerHeight || document.documentElement.clientHeight)) &&
            (boundingRectangle.right <= (window.innerWidth || document.documentElement.clientWidth))
        );

        if (isVisible) { return 0; }

        return boundingRectangle.top;
    }

    // Sets a class on this menu item
    function setClassOnMenuItem(menuElement:MenuElementInfo, classThisItem: string): void {
        menuElement.menuElement.classList.add(classThisItem);
    }

    // Sets the formmenu-is-visible of an item.
    // Note that this doesn't reset the formmenu-is-visible etc. classes of items that are not visible.
    function setVisibility(menuElement:MenuElementInfo): void {
        setClassOnMenuItem(menuElement, 'formmenu-is-visible');
    }

    function removeVisibilityForMenu(): void {
        let count = _menuElementInfos.length;
        for(let i = 0; i < count; i++) {
            _menuElementInfos[i].menuElement.classList.remove('formmenu-is-visible');
        }
    }

    // Returns true if the menuElementInfo has passed any filters, and it is not hidden
    // because any of its parents is closed.
    // Even if this returns true, the element could still be invisible because scrolled out of the
    // visible area of the menu.
    function elementIsShownInMenu(menuElementInfo: MenuElementInfo): boolean {
        if (!menuElementInfo.isIncludedInMenu) { return false; }

        for(let e = menuElementInfo.parent; e && (e !== _menuElementInfosRoot); e = e.parent) {
            if (!e.isExpanded) { return false; }
        }

        return true;
    }

    function elementIsHeader(menuElementInfo: MenuElementInfo): boolean {
        return (menuElementInfo.level < _levelNonHeadingMenuItem);
    }

    // Returns true if the given menu item is visible inside the menu box.
    // Assumes the entire menu box is in a fixed location on the page and is entirely visible.
    function menuItemIsVisible(menuElementInfo: MenuElementInfo): boolean {
        const menuItemSpan = getCaptionElement(menuElementInfo);
        const availableXSpace = _mainUlElement.clientHeight - menuItemSpan.clientHeight;
        const isVisible = 
            (menuElementInfo.menuElement.offsetTop >= _mainUlElement.scrollTop) &&
            (menuElementInfo.menuElement.offsetTop <= (_mainUlElement.scrollTop + availableXSpace));

        return isVisible;
    }

    // If given menu item is not visible inside the menu, scrolls the menu so the item
    // shows at the top.
    function menuItemMakeVisibleAtTop(menuElementInfo: MenuElementInfo): void {
        if (!menuItemIsVisible(menuElementInfo)) {
            _mainUlElement.scrollTop = menuElementInfo.menuElement.offsetTop;
        }
    }

    // If given menu item is not visible inside the menu, scrolls the menu so the item
    // shows at the bottom.
    function menuItemMakeVisibleAtBottom(menuElementInfo: MenuElementInfo): void {
        if (!menuItemIsVisible(menuElementInfo)) {
            const menuItemSpan = getCaptionElement(menuElementInfo);
            const availableXSpace = _mainUlElement.clientHeight - menuItemSpan.clientHeight;
    
            let newOffsetTop = menuElementInfo.menuElement.offsetTop - availableXSpace;
            if (newOffsetTop < 0) { newOffsetTop = 0; }
            _mainUlElement.scrollTop = newOffsetTop;
        }
    }

    function setVisibilityForMenu(): void {
        if (!_menuElementInfos) { return; }

        removeVisibilityForMenu();
        let count = _menuElementInfos.length;
        let lastWasVisible = false;

        // The element that is 1) above the screen; 2) closest to the screen of all elements above the screen;
        // 3) visible inside the menu (not hidden because a parent is closed).
        let invisibleMenuHeaderAboveVisibleArea: MenuElementInfo;

        // Distance to top of screen of invisibleMenuElementAboveVisibleArea.
        // This is negative. The closer to zero, the closer to the top.
        let closestDistanceToTop: number = Number.NEGATIVE_INFINITY;

        let firstVisibleElement: MenuElementInfo;
        let lastVisibleElement: MenuElementInfo;

        for(let i = 0; i < count; i++) {
            let currentMenuElementInfo = _menuElementInfos[i];
            let visibility:number = elementIsVisible(currentMenuElementInfo.domElement);

            const isVisible = (visibility === 0);

            if (!isVisible) {
                if ((visibility < 0) && (visibility > closestDistanceToTop) && 
                    elementIsHeader(currentMenuElementInfo) && 
                    elementIsShownInMenu(currentMenuElementInfo)) {
                        
                    invisibleMenuHeaderAboveVisibleArea = currentMenuElementInfo;
                }
            }

            // If we just got past the items that were visible, then the rest will be invisible,
            // so no need to visit any more items.
            if (lastWasVisible && !isVisible) { break; }
            lastWasVisible = isVisible;
            
            if (isVisible) {
                setVisibility(currentMenuElementInfo);

                if (!firstVisibleElement) {
                    firstVisibleElement = currentMenuElementInfo;
                }

                lastVisibleElement = currentMenuElementInfo;
            }
        }

        // The header just above the screen should be marked visible as well,
        // because at the top of the screen will probably be stuff that sits right under that header
        // but is not represented on the menu.
        if (invisibleMenuHeaderAboveVisibleArea) {
            setVisibility(invisibleMenuHeaderAboveVisibleArea);

            if (!firstVisibleElement) {
                firstVisibleElement = invisibleMenuHeaderAboveVisibleArea;
            }

            // Note that invisibleMenuHeaderAboveVisibleArea can only be the last visible element
            // if there are no other elements - seeing it by definition sits above all other
            // visible elements.

            if (!lastVisibleElement) {
                lastVisibleElement = invisibleMenuHeaderAboveVisibleArea;
            }
        }

        // Make sure that the menu elements associated with the visible dom elements
        // are actually in view.
        // Theoratically, there could be more visible elements than can be shown in the menu box.
        // You want to have the menu scrolling in the same direction as the document.
        // So, when scrolling down (towards bottom of the document), scroll the last "visible" menu item
        // into view. When scrolling up, scroll the first "visible" item in view.

        if (_scrollingDown) {
            menuItemMakeVisibleAtBottom(lastVisibleElement);
        } else {
            menuItemMakeVisibleAtTop(firstVisibleElement);
        }
    }

    // Finds out if the menu element in the menuElementInfo passes the search filter.
    // If so, updates the caption to highlight the matched bit and returns true.
    // Otherwise returns false.
    function passesSearchFilter(menuElementInfo: MenuElementInfo): boolean {
        const captionElement = getCaptionElement(menuElementInfo);

        // Restore the caption to its original state
        captionElement.innerHTML = menuElementInfo.caption;
        menuElementInfo.menuElement.classList.remove('formmenu-is-textmatch');

        if (!searchFilterIsActive()) {
            return true;
        }

        const filterValueLc = _searchTerm.toLowerCase();
        const foundIndex = menuElementInfo.caption.toLowerCase().indexOf(filterValueLc);

        // If there is no match, return
        if (foundIndex === -1) {
            return false;
        }

        const captionWithFilterTextSpan = insertMatchingFilterTextSpan(
            menuElementInfo.caption, foundIndex, filterValueLc.length);
        captionElement.innerHTML = captionWithFilterTextSpan;

        menuElementInfo.menuElement.classList.add('formmenu-is-textmatch');

        return true;
    }

    function passesItemStateFilters(menuElementInfo: MenuElementInfo): boolean {

        for (let i = 0; i < _itemStateInfoActiveFilters.length; i++) {
            if (menuElementInfo.itemStates.indexOf(_itemStateInfoActiveFilters[i]) === -1) {
                return false;
            }
        }

        return true;
    }

    function getMenuElementsUl(menuElementInfo: MenuElementInfo): HTMLUListElement {
        let ulElement: HTMLUListElement = document.createElement("ul");
        ulElement.classList.add('formmenu-top-menuitems');

        for(let i = 0; i < menuElementInfo.children.length; i++) {
            const childMenuElement = menuElementInfo.children[i];
            childMenuElement.isIncludedInMenu = false;

            const liElement = getMenuElementLi(childMenuElement);

            if (liElement) {
                ulElement.appendChild(liElement);
                childMenuElement.isIncludedInMenu = true;
            }
        }

        return ulElement;
    }

    // Gets the li element representing a menu element from the corresponding menuElementInfo.
    // Returns falsy if the menu element should not be shown (because it doesn't pass a filter).
    function getMenuElementLi(menuElementInfo: MenuElementInfo): HTMLElement {
        const ulElement: HTMLUListElement = getMenuElementsUl(menuElementInfo);
        let hasChildren = (ulElement.children.length > 0);

        setClass(menuElementInfo.menuElement, hasChildren, 'formmenu-has-children');

        if ((!passesSearchFilter(menuElementInfo)) && (!hasChildren)) { return null; }
        if ((!passesItemStateFilters(menuElementInfo)) && (!hasChildren)) { return null; }

        let liElement: HTMLLIElement = document.createElement("li");
        liElement.appendChild(menuElementInfo.menuElement);

        if (hasChildren) {
            liElement.appendChild(ulElement);

            setClass(menuElementInfo.menuElement, menuElementInfo.isExpanded, "formmenu-item-open")
        }

        return liElement;
    }

    // Debounces calls to a method.
    // timerId - store this between calls. Will be updated by the method. Initialise to a { id: 0 }
    // bounceMs - the method will not be called more often than once every bounceMs milliseconds.
    // callback - method to be called.
    function debounce(timerId: { id: number }, bounceMs: number, callback: ()=>void) {
        if (timerId.id) { clearTimeout(timerId.id); }
        timerId.id = setTimeout(callback, bounceMs);
    }

    let rebuildMenuDebounceTimer = { id: 0 };

    // Replaces the last child in the main div with a ul holding the menu items
    function rebuildMenuList(): void {
        debounce(rebuildMenuDebounceTimer, 50, function() {
            const ulElement = getMenuElementsUl(_menuElementInfosRoot);

            // The top level ul must be positioned, so location of menu items within that ul
            // can be determined with offsetTop
            // Make sure ONLY the top level ul is positioned, not lower level ones.

            ulElement.style.position = "relative";

            _mainMenuElement.replaceChild(ulElement, _mainUlElement);
            _mainUlElement = ulElement;

            ensureMenuBottomVisible();
        });
    }

    export function scrollHandler(): void {

        let currentYOffset = window.pageYOffset;
        _scrollingDown = (currentYOffset > _lastPageYOffset);
        _lastPageYOffset = (currentYOffset < 0) ? 0 : currentYOffset;

        setVisibilityForMenu();
    }

    export function resizeHandler(): void {
        setVisibilityForMenu();
        ensureMenuBottomVisible();
    }

    export function pageLoadedHandler(): void {
        _lastPageYOffset = window.pageYOffset;

        _menuElementInfos = domElementsToMenuElements(getAllDomElements());
        setParents(_menuElementInfosRoot, { value:0}, _menuElementInfos);

        // Set _mainMenuElement early, because it will be used if setActive is called (part of itemStateInfo).
        // setActive may be called while the menu is being created.
        _mainMenuElement = createMainMenuElement();

        if (localStorage.getItem('formmenu-hidden')) {
            _mainMenuElement.classList.add('formmenu-hidden');
        }

        addMenuBody(_mainMenuElement, _menuElementInfos);

        setVisibilityForMenu();

        setDimensionsFromLocalStorage();

        let bodyElement = document.getElementsByTagName("BODY")[0];
        bodyElement.appendChild(_mainMenuElement);
    }
}
