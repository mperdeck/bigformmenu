///<reference path="..\bigformmenu.d.ts" />
// -----------------------------------
// Always load the bigformmenu.js file before any ...bigformmenu.config.js files
// -----------------------------------
var BigFormMenu;
(function (BigFormMenu) {
    BigFormMenu.bigFormMenuConfiguration.querySelector = "h1,h2,h3,h4,h5,h6,label";
    // if itemStateInfos is undefined, set it now
    if (!BigFormMenu.bigFormMenuConfiguration.itemStateInfos) {
        BigFormMenu.bigFormMenuConfiguration.itemStateInfos = {};
    }
    BigFormMenu.bigFormMenuConfiguration.itemStateInfos["html5required"] = {
        onChangeMenuItemsWithItemStateExist: null,
        hasActiveStateClass: 'bigformmenu-is-required',
        stateFilterActiveClass: 'bigformmenu-required-filter-is-active',
        stateFilterButtonClass: 'bigformmenu-required-filter-button',
        wireUp: function (domElement, setActive) {
            if (domElement.tagName.toLowerCase() !== 'label') {
                return;
            }
            var labelElement = domElement;
            var inputElementId = labelElement.htmlFor;
            var inputElement = document.getElementById(inputElementId);
            setActive(inputElement.required);
        }
    };
    BigFormMenu.bigFormMenuConfiguration.itemStateInfos["html5invalid"] = {
        onChangeMenuItemsWithItemStateExist: function (exist) {
            // Disable the save button if there are invalid input elements.
            // Note that when this callback starts getting called, the buttons will not yet be in the DOM,
            // so use the button returned in the wireUp method of the menuButtons object.
            if (BigFormMenu.menuSaveButton) {
                BigFormMenu.menuSaveButton.disabled = exist;
            }
        },
        hasActiveStateClass: 'bigformmenu-is-invalid',
        stateFilterActiveClass: 'bigformmenu-invalid-filter-is-active',
        stateFilterButtonClass: 'bigformmenu-invalid-filter-button',
        wireUp: function (domElement, setActive) {
            if (domElement.tagName.toLowerCase() !== 'label') {
                return;
            }
            var labelElement = domElement;
            var inputElementId = labelElement.htmlFor;
            var inputElement = document.getElementById(inputElementId);
            setActive(!inputElement.validity.valid);
            inputElement.addEventListener("input", function () {
                setActive(!inputElement.validity.valid);
            });
        }
    };
})(BigFormMenu || (BigFormMenu = {}));
//# sourceMappingURL=html5form.bigformmenu.config.js.map