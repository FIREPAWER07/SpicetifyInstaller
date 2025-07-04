export class DropdownHandler {
  private dropdownButton: HTMLElement
  private dropdownMenu: HTMLElement
  private dropdownIcon: HTMLElement
  private selectedOption: HTMLElement
  private isOpen = false
  private optionSelectedCallback: (optionName: string, command: string) => void
  private dropdownPortal: HTMLElement | null = null

  constructor(optionSelectedCallback: (optionName: string, command: string) => void) {
    this.dropdownButton = document.getElementById("dropdown-button")!
    this.dropdownMenu = document.getElementById("dropdown-menu")!
    this.dropdownIcon = document.getElementById("dropdown-icon")!
    this.selectedOption = document.getElementById("selected-option")!
    this.optionSelectedCallback = optionSelectedCallback

    this.createDropdownPortal()
    this.initEventListeners()
  }

  private createDropdownPortal(): void {
    this.dropdownPortal = document.createElement("div")
    this.dropdownPortal.id = "dropdown-portal"
    this.dropdownPortal.className = "dropdown-menu-portal hidden"
    this.dropdownPortal.innerHTML = this.dropdownMenu.innerHTML
    document.body.appendChild(this.dropdownPortal)

    this.dropdownMenu.style.display = "none"
  }

  private initEventListeners(): void {
    this.dropdownButton.addEventListener("click", (e) => {
      e.stopPropagation()
      this.toggleDropdown()
    })

    document.addEventListener("click", (event) => {
      if (
        !this.dropdownButton.contains(event.target as Node) &&
        (!this.dropdownPortal || !this.dropdownPortal.contains(event.target as Node)) &&
        this.isOpen
      ) {
        this.closeDropdown()
      }
    })

    if (this.dropdownPortal) {
      this.dropdownPortal.querySelectorAll(".dropdown-item").forEach((item) => {
        item.addEventListener("click", () => {
          const command = item.getAttribute("data-command")!
          const optionName = item.querySelector(".item-text")!.textContent!
          this.selectOption(optionName, command)
          this.closeDropdown()
        })
      })
    }
  }

  private toggleDropdown(): void {
    if (this.isOpen) {
      this.closeDropdown()
    } else {
      this.openDropdown()
    }
  }

  private openDropdown(): void {
    if (this.dropdownPortal) {
      const buttonRect = this.dropdownButton.getBoundingClientRect()
      this.dropdownPortal.style.position = "absolute"
      this.dropdownPortal.style.top = `${buttonRect.bottom + window.scrollY + 5}px`
      this.dropdownPortal.style.left = `${buttonRect.left + window.scrollX}px`
      this.dropdownPortal.style.width = `${buttonRect.width}px`
      this.dropdownPortal.style.zIndex = "9999999"

      this.dropdownPortal.classList.remove("hidden")
      this.dropdownPortal.classList.add("visible")
    }

    this.dropdownIcon.textContent = "expand_less"
    this.isOpen = true
  }

  private closeDropdown(): void {
    if (this.dropdownPortal) {
      this.dropdownPortal.classList.remove("visible")
      this.dropdownPortal.classList.add("hidden")
    }

    this.dropdownIcon.textContent = "expand_more"
    this.isOpen = false
  }

  private selectOption(optionName: string, command: string): void {
    this.selectedOption.textContent = optionName
    this.optionSelectedCallback(optionName, command)
  }
}
