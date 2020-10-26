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

document.addEventListener("resize", function(){
    FormMenu.resizeHandler();
});

namespace FormMenu {
    let defaultConfiguration: any = {
        skipFirstHeading: false,
        defaultOpenAtLevel: 1,
        domItemHighlightPeriodMS: 500,
        showFilterInput: true,
        filterPlaceholder: 'filter',
        filterMinimumCharacters: '2',
        showMenuHideShowButton: true
    }

    class MenuElementInfo {

        constructor(
            // The item in the menu
            public menuElement: HTMLElement,

            // The heading, etc. in the actual DOM (not in the menu)
            public domElement: HTMLElement,

            // Caption of the menu element
            public caption: string,

            // Level of the menu item. For example, a H1 has level 1, H2 has level 2.
            // Menu items that are not associated with a heading have a very high level.
            public level: number
        ) {}

        // Headings constitute a hierarchy. An H2 below an H1 is the child of that H1.
        // non-headings are children of the heading they sit under.
        public parent: MenuElementInfo;
    }

    let menuElementInfos: MenuElementInfo[];

    // The div that contains the entire menu
    let mainMenuElement:HTMLElement;

    const levelNonHeadingMenuItem: number = 9000;

    function getConfigValue(itemName: string): any {
        // formMenuConfiguration may have been merged in (by loading the formmenu.config.js file)
        // First try to get the value from there. Otherwise get it from the default config.
        // Note that you want to check against undefined specifically, because for example false
        // is a valid value.
        if (formMenuConfiguration && (typeof formMenuConfiguration[itemName] !== 'undefined')) {
            return formMenuConfiguration[itemName];
        }

        return defaultConfiguration[itemName]; 
    }

    // Returns all heading tags
    function getAllDomElements(): NodeListOf<Element> {
        // Note that HTML only has these heading tags. There is no h7, etc.
        let allDomElements = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
        return allDomElements;
    }

    // Converts a list of heading tags to MenuElements.
    // Skips the first heading if config item skipFirstHeading is true.
    function domElementsToMenuElements(domElements: NodeListOf<Element>): MenuElementInfo[] {
        let menuElementInfos: MenuElementInfo[] = [];

        let includeElement: boolean = !getConfigValue("skipFirstHeading");

        domElements.forEach((value: Element)=>{
            if (includeElement) { menuElementInfos.push(domElementToMenuElement(value as HTMLElement)); }
            includeElement = true;
        });

        return menuElementInfos;
    }

    function domElementToMenuElement(domElement: HTMLElement): MenuElementInfo {
        let menuElementClass = 'formmenu-' + domElement.tagName;
        let caption = domElement.innerText;
        let domItemHighlightPeriodMS: number = getConfigValue("domItemHighlightPeriodMS");

        // If a menu item gets clicked, scroll the associated dom element into view
        // Also give it the formmenu-highlighted-dom-item for a short time, to point out where
        // it is.
        let onClickHandler = (e:MouseEvent)=>{
            domElement.scrollIntoView();
            domElement.classList.add('formmenu-highlighted-dom-item');
            setTimeout(function(){ domElement.classList.remove('formmenu-highlighted-dom-item'); }, domItemHighlightPeriodMS);
        };

        let level:number = tagNameToLevel(domElement.tagName);
        let menuElementInfo = new MenuElementInfo(
            createMenuElementDiv(caption, menuElementClass, onClickHandler),
            domElement,
            caption,
            level);

        return menuElementInfo;
    }

    function tagNameToLevel(tagName: string): number {
        switch (tagName.toLowerCase()) {
            case 'h1': return 1;
            case 'h2': return 2;
            case 'h3': return 3;
            case 'h4': return 4;
            case 'h5': return 5;
            case 'h6': return 6;
            default: return levelNonHeadingMenuItem;
          }
    }

    // If the element has class1, sets class2 instead. And vice versa.
    function toggleClass(htmlElement:HTMLElement, class1: string, class2: string): void {
        if (htmlElement.classList.contains(class1)) {
            htmlElement.classList.remove(class1);
            htmlElement.classList.add(class2);
        } else if (htmlElement.classList.contains(class2)) {
            htmlElement.classList.remove(class2);
            htmlElement.classList.add(class1);
        }
    }

    function parentOfEventTarget(e:MouseEvent): HTMLElement {
        // See https://developer.mozilla.org/en-US/docs/Web/API/Event/currentTarget
        // currentTarget will return the span containing the caption.

        let parent:HTMLElement = (<any>(e.currentTarget)).parentNode;
        return parent;
    }

    function onExpandClicked(e:MouseEvent) {
        // The span with the open/close icon element will have been clicked.
        // Its parent is the div that also contains the caption.

        let parentDiv:HTMLElement = parentOfEventTarget(e);

        toggleClass(parentDiv, 'formmenu-item-closed', 'formmenu-item-open');
    }

    function createMenuElementDiv(caption: string, cssClass: string, onClickHandler: (e:MouseEvent)=>void): HTMLElement {
        let menuElement: HTMLElement = document.createElement("div");

        let expandElement: HTMLElement = document.createElement("span");
        expandElement.classList.add("formmenu-expand");
        expandElement.onclick = onExpandClicked;
        menuElement.appendChild(expandElement);

        let captionElement: HTMLElement = document.createElement("span");
        captionElement.classList.add("formmenu-caption");
        captionElement.innerHTML = caption;
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

    // Creates a <ul> tag containing a <li> tag for items in menuElementInfos.
    // The first li is for the item in menuElementInfos with index i.
    //
    // It goes forward through menuElementInfos until
    // 1) menuElementInfos is exhaused; or
    // 2) it finds an with the same level or lower as the level of the parent. That item then won't be added to the ul.
    //
    // parent is the menu item that is the parent of the list items. Will be null when the very top level of menu items
    // is generated.
    //
    // Note that i is an object containing a number. When the method returns, that number will have been
    // updated to the index + 1 of the last item in the list.
    function createList(parent: MenuElementInfo, i: { value:number}, menuElementInfos: MenuElementInfo[]): HTMLUListElement {
        const level: number = parent ? parent.level : 0;
        let listElement: HTMLUListElement = document.createElement("ul");

        while((i.value < menuElementInfos.length) && (menuElementInfos[i.value].level > level)) {
            let liElement = createListItem(parent, i, menuElementInfos);
            listElement.appendChild(liElement);
        }

        return listElement;
    }

    // Creates a <li> item for the item in menuElementInfos that is pointed at by index i.
    //
    // Note that i is an object containing a number. When the method returns, that number will have been
    // updated to the index + 1 of the last child of the item (or index + 1 of the item itself
    // if it doesn't have children).
    function createListItem(parent: MenuElementInfo, i: { value:number}, menuElementInfos: MenuElementInfo[]): HTMLLIElement {
        let currentMenuElementInfo = menuElementInfos[i.value];
        currentMenuElementInfo.parent = parent;

        let listItemElement: HTMLLIElement = document.createElement("li");
        listItemElement.appendChild(currentMenuElementInfo.menuElement);

        // Point to first child item
        i.value = i.value + 1;

        let listElement: HTMLUListElement = createList(
            currentMenuElementInfo, i, menuElementInfos);
        
        // Only append the ul with children if there actually are children
        if (listElement.children.length > 0) {
            listItemElement.appendChild(listElement);

            // If you appended the list (as in, the element has children), then also set
            // the formmenu-item-closed or formmenu-item-open class, so the element will have open/close icons.

            let openCloseClass = "formmenu-item-closed";
            let defaultOpenAtLevel: number = getConfigValue("defaultOpenAtLevel");

            if (currentMenuElementInfo.level <= defaultOpenAtLevel) {
                openCloseClass = "formmenu-item-open";
            }

            currentMenuElementInfo.menuElement.classList.add(openCloseClass);
        }

        return listItemElement;
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
        const filterValue = (<HTMLInputElement>(e.currentTarget)).value;
        const filterMinimumCharacters: number = getConfigValue("filterMinimumCharacters");

        // Filter is active if there is a filter value, and there are enough filter characters.
        const filterIsActive = (filterValue && (filterValue.length >= filterMinimumCharacters));

        if (filterIsActive) {
            mainMenuElement.classList.add('formmenu-filter-is-active');
        } else {
            mainMenuElement.classList.remove('formmenu-filter-is-active');
        }

        menuElementInfos.forEach((menuElementInfo:MenuElementInfo) => {
            const captionElement = getCaptionElement(menuElementInfo);

            // Restore the caption to its original state
            captionElement.innerHTML = menuElementInfo.caption;
            menuElementInfo.menuElement.classList.remove('formmenu-is-filter-result');
            menuElementInfo.menuElement.classList.remove('formmenu-is-parent-of-filter-result');

            // If filter is not active, nothing more to do
            if (!filterIsActive) {
                return;
            }

            const filterValueLc = filterValue.toLowerCase();
            const foundIndex = menuElementInfo.caption.toLowerCase().indexOf(filterValueLc);

            // If there is no match, return
            if (foundIndex === -1) {
                return;
            }

            const captionWithFilterTextSpan = insertMatchingFilterTextSpan(
                menuElementInfo.caption, foundIndex, filterValueLc.length);

            captionElement.innerHTML = captionWithFilterTextSpan;

            setClassOnMenuItem(menuElementInfo, 'formmenu-is-filter-result', 'formmenu-is-parent-of-filter-result');
        });
    }

    function createFilterInput(): HTMLInputElement {
        let menuElement: HTMLInputElement = document.createElement("input");
        menuElement.type = "filter";
        menuElement.className = 'formmenu-filter';

        let filterPlaceholder = getConfigValue("filterPlaceholder");
        if (filterPlaceholder) {
            menuElement.placeholder = filterPlaceholder;
        }

        // onChange only fires after you've clicked outside the input box.
        // onKeypress fires before the value has been updated, so you get the old value, not the latest value
        menuElement.onkeyup = onChangeFilter;

        // onfilter fires when the little clear icon is clicked
        (<any>menuElement).onfilter = onChangeFilter;

        return menuElement;
    }

    function onMenuHideShowButtonClicked(e: MouseEvent): void {
        // The span with the hide/show will have been clicked.
        // Its parent is the formmenu div.

        let parentDiv:HTMLElement = parentOfEventTarget(e);

        toggleClass(parentDiv, 'formmenu-hidden', 'formmenu-shown');
    }

    // Add a filter button to the filter bar (the bit of space left of the filter).
    // cssClass - css class of the span representing the button.
    // onClickHandler - runs when button is clicked.
    // showHideConfigName - name of a config item. Only if this is true will the button be created.
    // parent - filter button will be added to this element.
    //
    function createFilterButton(cssClass: string, onClickHandler: (e: MouseEvent) => void,
        showHideConfigName: string, parent: HTMLElement) {

        let showButton: boolean = getConfigValue(showHideConfigName);
        if (!showButton) {
            return;
        }

        let filterButton: HTMLElement = document.createElement("span");
        filterButton.classList.add(cssClass);
        filterButton.classList.add('formmenu-filter-button');
        filterButton.onclick = onClickHandler;

        parent.appendChild(filterButton);
    }

    function createMenu(menuElementInfos: MenuElementInfo[]): HTMLElement {
        let menuElement: HTMLElement = document.createElement("div");
        menuElement.classList.add('formmenu');
        menuElement.classList.add('formmenu-shown');
        menuElement.id = 'formmenu';

        createFilterButton('formmenu-menu-hide-show', onMenuHideShowButtonClicked,
            "showMenuHideShowButton", menuElement);

        let filterBar: HTMLElement = document.createElement("span");
        filterBar.classList.add('formmenu-filter-bar');

        let showFilterInput: boolean = getConfigValue("showFilterInput");
        if (showFilterInput) {
            let filterInput = createFilterInput();
            filterBar.appendChild(filterInput);
        }

        menuElement.appendChild(filterBar);

        let topList: HTMLUListElement = createList(null, { value:0}, menuElementInfos);
        menuElement.appendChild(topList);

        return menuElement;
    }

    function elementIsVisible(element: HTMLElement): boolean {
        const boundingRectangle = element.getBoundingClientRect();
        return (
            (boundingRectangle.top >= 0) &&
            (boundingRectangle.left >= 0) &&
            (boundingRectangle.bottom <= (window.innerHeight || document.documentElement.clientHeight)) &&
            (boundingRectangle.right <= (window.innerWidth || document.documentElement.clientWidth))
        );
    }

    // Sets a class on this menu item, and another class on the parent of the item, its parents, etc.
    function setClassOnMenuItem(menuElement:MenuElementInfo, classThisItem: string, classParents: string): void {
        menuElement.menuElement.classList.add(classThisItem);

        let currentElement = menuElement.parent;
        while(currentElement) {
            // If the class for parents has already been set on a parent, it will have been set on that
            // parent's parents as well. So can stop here.

            if (currentElement.menuElement.classList.contains(classParents)) { break; }
            currentElement.menuElement.classList.add(classParents);
            
            currentElement = currentElement.parent;
        }
    }

    // Sets the formmenu-is-visible of an item, and the formmenu-is-parent-of-visible
    // class on its parents.
    // Note that this doesn't reset the formmenu-is-visible etc. classes of items that are not visible.
    function setVisibility(menuElement:MenuElementInfo): void {
        setClassOnMenuItem(menuElement, 'formmenu-is-visible', 'formmenu-is-parent-of-visible');
    }

    function removeVisibilityForMenu(): void {
        let count = menuElementInfos.length;
        for(let i = 0; i < count; i++) {
            menuElementInfos[i].menuElement.classList.remove('formmenu-is-visible');
            menuElementInfos[i].menuElement.classList.remove('formmenu-is-parent-of-visible');
        }
    }

    function setVisibilityForMenu(): void {
        if (!menuElementInfos) { return; }

        removeVisibilityForMenu();
        let count = menuElementInfos.length;
        let lastWasVisible = false;

        for(let i = 0; i < count; i++) {
            let currrentMenuElementInfo = menuElementInfos[i];
            let isVisible = elementIsVisible(currrentMenuElementInfo.domElement);

            // If we just got past the items that were visible, then the rest will be invisible,
            // so no need to visit any more items.
            if (lastWasVisible && !isVisible) { break; }
            lastWasVisible = isVisible;
            
            if (isVisible) {
                setVisibility(currrentMenuElementInfo);
            }
        }
    }

    export function scrollHandler(): void {
        setVisibilityForMenu();
    }

    export function resizeHandler(): void {
        setVisibilityForMenu();
    }

    export function pageLoadedHandler(): void {
        menuElementInfos = domElementsToMenuElements(getAllDomElements());
        mainMenuElement = createMenu(menuElementInfos);
        setVisibilityForMenu();

        let bodyElement = document.getElementsByTagName("BODY")[0];
        bodyElement.appendChild(mainMenuElement);
    }
}
