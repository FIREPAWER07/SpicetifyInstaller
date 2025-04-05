export class DropdownHandler {
  private dropdownButton: HTMLElement;
  private dropdownMenu: HTMLElement;
  private dropdownIcon: HTMLElement;
  private selectedOptionText: HTMLElement;
  private isOpen = false;
  private onSelectCallback: (optionName: string, command: string) => void;
  private scrollHandler: (() => void) | null = null;

  constructor(onSelect: (optionName: string, command: string) => void) {
    this.onSelectCallback = onSelect;
    this.dropdownButton = document.getElementById("dropdown-button")!;
    this.dropdownIcon = document.getElementById("dropdown-icon")!;
    this.selectedOptionText = document.getElementById("selected-option")!;

    this.createDropdownInBody();

    this.initEventListeners();
  }

  private createDropdownInBody() {
    const originalDropdown = document.getElementById("dropdown-menu");
    if (!originalDropdown) {
      console.error("Original dropdown not found");
      return;
    }

    const newDropdown = document.createElement("div");
    newDropdown.id = "dropdown-menu-portal";
    newDropdown.className = "dropdown-menu-portal hidden";
    newDropdown.innerHTML = originalDropdown.innerHTML;

    document.body.appendChild(newDropdown);

    this.dropdownMenu = newDropdown;

    originalDropdown.style.display = "none";
  }

  private initEventListeners() {
    this.dropdownButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    document.addEventListener("click", (e) => {
      if (this.isOpen && !this.dropdownMenu.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });

    const dropdownItems = this.dropdownMenu.querySelectorAll(".dropdown-item");
    dropdownItems.forEach((item) => {
      item.addEventListener("click", () => {
        const command = (item as HTMLElement).dataset.command || "";
        const optionName = item.querySelector(".item-text")?.textContent || "";
        this.selectOption(optionName, command);
      });
    });
  }

  private toggleDropdown() {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private updateDropdownPosition = () => {
    const buttonRect = this.dropdownButton.getBoundingClientRect();
    this.dropdownMenu.style.width = `${buttonRect.width}px`;
    this.dropdownMenu.style.left = `${buttonRect.left}px`;
    this.dropdownMenu.style.top = `${buttonRect.bottom + 5}px`;
  };

  private openDropdown() {
    this.updateDropdownPosition();

    this.dropdownMenu.classList.remove("hidden");
    setTimeout(() => {
      this.dropdownMenu.classList.add("visible");
    }, 10);

    this.dropdownIcon.textContent = "expand_less";
    this.dropdownIcon.classList.add("rotate");

    this.isOpen = true;

    this.scrollHandler = this.updateDropdownPosition;
    window.addEventListener("scroll", this.scrollHandler);
  }

  private closeDropdown() {
    this.dropdownMenu.classList.remove("visible");
    setTimeout(() => {
      this.dropdownMenu.classList.add("hidden");
    }, 300);

    this.dropdownIcon.textContent = "expand_more";
    this.dropdownIcon.classList.remove("rotate");

    this.isOpen = false;

    if (this.scrollHandler) {
      window.removeEventListener("scroll", this.scrollHandler);
      this.scrollHandler = null;
    }
  }

  private selectOption(optionName: string, command: string) {
    this.selectedOptionText.textContent = optionName;
    this.closeDropdown();
    this.onSelectCallback(optionName, command);
  }
}
