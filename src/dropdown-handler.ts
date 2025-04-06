export class DropdownHandler {
  private dropdownButton: HTMLElement;
  private dropdownMenu: HTMLElement;
  private dropdownIcon: HTMLElement;
  private selectedOption: HTMLElement;
  private onItemSelect: (optionName: string, command: string) => void;

  constructor(onItemSelect: (optionName: string, command: string) => void) {
    this.dropdownButton = document.getElementById("dropdown-button")!;
    this.dropdownMenu = document.getElementById("dropdown-menu")!;
    this.dropdownIcon = document.getElementById("dropdown-icon")!;
    this.selectedOption = document.getElementById("selected-option")!;
    this.onItemSelect = onItemSelect;

    this.initEventListeners();
  }

  private initEventListeners(): void {
    this.dropdownButton.addEventListener("click", () => {
      this.toggleDropdown();
    });

    this.dropdownMenu.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (
        target.classList.contains("dropdown-item") ||
        target.parentElement?.classList.contains("dropdown-item")
      ) {
        const dropdownItem = target.classList.contains("dropdown-item")
          ? target
          : target.parentElement;
        const command = dropdownItem?.getAttribute("data-command") || "";
        const optionName =
          (dropdownItem?.querySelector(".item-text") as HTMLElement)
            ?.textContent || "";
        this.selectItem(optionName, command);
      }
    });

    document.addEventListener("click", (event) => {
      if (
        !this.dropdownButton.contains(event.target as Node) &&
        this.dropdownMenu.classList.contains("visible")
      ) {
        this.closeDropdown();
      }
    });
  }

  private toggleDropdown(): void {
    this.dropdownMenu.classList.toggle("visible");
    this.dropdownIcon.classList.toggle("rotate");
  }

  private closeDropdown(): void {
    this.dropdownMenu.classList.remove("visible");
    this.dropdownIcon.classList.remove("rotate");
  }

  private selectItem(optionName: string, command: string): void {
    this.selectedOption.textContent = optionName;
    this.onItemSelect(optionName, command);
    this.closeDropdown();
  }
}
