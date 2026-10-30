# coding: utf-8
from typing import Any

from PyQt5.QtWidgets import QButtonGroup

from qfluentwidgets import BodyLabel, MessageBoxBase, RadioButton, SubtitleLabel

class DownloadOptionDialog(MessageBoxBase):
    """Download parser or quality selector built from provider options."""

    def __init__(
        self,
        title: str,
        description: str,
        options: list[dict[str, Any]],
        selected_value: str = "",
        parent=None,
    ) -> None:
        super().__init__(parent)
        self.options = options
        self.selected_option = options[0] if options else {}
        self.button_group = QButtonGroup(self)
        self.title_label = SubtitleLabel(title, self)
        self.desc_label = BodyLabel(description, self)
        self.selected_value = selected_value

        self._init_widget()

    def _init_widget(self) -> None:
        self.yesButton.setText(self.tr("开始下载"))
        self.cancelButton.setText(self.tr("取消"))
        self.viewLayout.addWidget(self.title_label)
        self.viewLayout.addWidget(self.desc_label)

        for option in self.options:
            label = self._option_label(option)
            button = RadioButton(label, self)
            button.setProperty("optionValue", option.get("value"))
            button.setFixedHeight(32)
            self.button_group.addButton(button)
            self.viewLayout.addWidget(button)
            if option.get("value") == self.selected_value or option == self.selected_option:
                button.setChecked(True)
                self.selected_option = option

        self.button_group.buttonClicked.connect(self._on_button_clicked)

    def _option_label(self, option: dict[str, Any]) -> str:
        label = str(option.get("label") or option.get("value") or "默认")
        quality = str(option.get("quality") or "").strip()
        file_format = str(option.get("format") or "").strip()
        detail = " / ".join(value for value in (quality, file_format) if value)
        return f"{label} ({detail})" if detail else label

    def _on_button_clicked(self, button: RadioButton) -> None:
        selected_value = button.property("optionValue")
        for option in self.options:
            if option.get("value") == selected_value:
                self.selected_option = option
                return
