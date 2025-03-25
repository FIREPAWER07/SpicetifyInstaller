interface SpicetifyCommand {
  name: string;
  command: string;
  description: string;
}

class SpicetifyInstaller {
  private dropdownButton: HTMLElement;
  private dropdownMenu: HTMLElement;
  private dropdownIcon: HTMLElement;
  private selectedOptionText: HTMLElement;
  private commandDisplay: HTMLElement;
  private executeButton: HTMLButtonElement;
  private outputElement: HTMLElement;
  private selectedCommand: string | null = null;

  private commands: SpicetifyCommand[] = [
    {
      name: "INSTALL",
      command: "spicetify install",
      description: "Installs Spicetify on your system",
    },
    {
      name: "REPAIR",
      command: "spicetify restore backup apply",
      description: "Restores from backup and applies Spicetify",
    },
    {
      name: "BACKUP",
      command: "spicetify backup",
      description: "Creates a backup of your Spotify installation",
    },
    {
      name: "UNINSTALL",
      command: "spicetify restore",
      description: "Restores Spotify to its original state",
    },
  ];

  constructor() {
    this.dropdownButton = document.getElementById("dropdown-button")!;
    this.dropdownMenu = document.getElementById("dropdown-menu")!;
    this.dropdownIcon = document.getElementById("dropdown-icon")!;
    this.selectedOptionText = document.getElementById("selected-option")!;
    this.commandDisplay = document.getElementById("command-display")!;
    this.executeButton = document.getElementById(
      "execute-button"
    ) as HTMLButtonElement;
    this.outputElement = document.getElementById("output")!;

    this.initEventListeners();
  }

  private initEventListeners(): void {
    // Toggle dropdown menu
    this.dropdownButton.addEventListener("click", () => {
      this.toggleDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (event) => {
      if (
        !this.dropdownButton.contains(event.target as Node) &&
        !this.dropdownMenu.contains(event.target as Node)
      ) {
        this.closeDropdown();
      }
    });

    // Handle option selection
    const dropdownItems = document.querySelectorAll(".dropdown-item");
    dropdownItems.forEach((item) => {
      item.addEventListener("click", () => {
        const command = (item as HTMLElement).dataset.command || "";
        const optionName = item.textContent || "";
        this.selectOption(optionName, command);
      });
    });

    // Execute command button
    this.executeButton.addEventListener("click", () => {
      this.executeCommand();
    });
  }

  private toggleDropdown(): void {
    const isHidden = this.dropdownMenu.classList.contains("hidden");

    if (isHidden) {
      this.openDropdown();
    } else {
      this.closeDropdown();
    }
  }

  private openDropdown(): void {
    this.dropdownMenu.classList.remove("hidden");
    this.dropdownIcon.innerHTML = "&#x2303;"; // Up chevron
    this.dropdownIcon.classList.add("chevron-up");
  }

  private closeDropdown(): void {
    this.dropdownMenu.classList.add("hidden");
    this.dropdownIcon.innerHTML = "&#x2304;"; // Down chevron
    this.dropdownIcon.classList.remove("chevron-up");
  }

  private selectOption(optionName: string, command: string): void {
    this.selectedOptionText.textContent = optionName;
    this.selectedCommand = command;
    this.commandDisplay.textContent = `$ ${command}`;
    this.executeButton.disabled = false;
    this.closeDropdown();
  }

  private executeCommand(): void {
    if (!this.selectedCommand) return;

    // In a real application, you would execute the command here
    // For this demo, we'll simulate command execution
    this.outputElement.classList.add("active");
    this.outputElement.textContent = `Executing: ${this.selectedCommand}\n`;

    // Simulate command output
    const commandName = this.selectedCommand.split(" ")[1];
    const command = this.commands.find((cmd) =>
      cmd.command.includes(commandName)
    );

    setTimeout(() => {
      this.outputElement.textContent += `\n[Spicetify] ${
        command?.description || "Command executed"
      }\n`;
      this.outputElement.textContent +=
        "[Spicetify] Operation completed successfully!";
    }, 1000);
  }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  new SpicetifyInstaller();
});
