// GlobalModal - 自包含的全域彈窗模組
// 從 indexV2.html 內聯主邏輯抽離，行為不變
const GlobalModal = {
  overlay:      document.getElementById("globalModal"),
  titleEl:      document.getElementById("gmTitle"),
  contentEl:    document.getElementById("gmContent"),
  inputWrapper: document.getElementById("gmInputWrapper"),
  inputEl:      document.getElementById("gmInput"),
  dateInputEl:  document.getElementById("gmDateInput"),
  selectEl:     document.getElementById("gmSelect"),
  discardBtn:   document.getElementById("gmDiscardBtn"),
  cancelBtn:    document.getElementById("gmCancelBtn"),
  confirmBtn:   document.getElementById("gmConfirmBtn"),

  show({ title, content, type = "alert", defaultVal = "", selectHtml = "", inputType = "text", confirmText = "確定", cancelText = "取消", discardText = "", onConfirm, onCancel, onDiscard }) {
    this.titleEl.textContent  = title;
    this.contentEl.innerHTML  = content;
    this.inputWrapper.style.display = type === "prompt" ? "flex" : "none";
    this.inputEl.value = defaultVal;
    this.inputEl.type = inputType;
    if (this.dateInputEl) this.dateInputEl.value = "";
    this.selectEl.style.display   = type === "select" ? "block" : "none";
    this.selectEl.innerHTML        = selectHtml;
    this.cancelBtn.style.display   = type === "alert" ? "none" : "block";
    this.cancelBtn.textContent = cancelText;
    this.confirmBtn.textContent = confirmText;
    this.discardBtn.style.display = discardText ? "block" : "none";
    this.discardBtn.textContent = discardText;
    this.cancelBtn.onclick  = () => {
      this.overlay.style.display = "none";
      if (onCancel) onCancel();
    };
    this.discardBtn.onclick = () => {
      this.overlay.style.display = "none";
      if (onDiscard) onDiscard();
    };
    this.confirmBtn.onclick = () => {
      this.overlay.style.display = "none";
      if (onConfirm) {
        if (type === "prompt") onConfirm(this.inputEl.value);
        else if (type === "select") onConfirm(this.selectEl.value);
        else onConfirm(true);
      }
    };
    this.overlay.style.display = "flex";
    if (type === "prompt") setTimeout(() => this.inputEl.focus(), 100);
  },
  alert(msg)                   { this.show({ title: "提示",   content: msg, type: "alert" }); },
  confirm(msg, onConfirm, onCancel) { this.show({ title: "請確認", content: msg, type: "confirm", onConfirm, onCancel }); },
  prompt(msg, defaultVal, onConfirm, options = {}) { this.show({ title: "輸入", content: msg, type: "prompt", defaultVal, onConfirm, ...options }); },
  select(title, msg, selectHtml, onConfirm) { this.show({ title, content: msg, type: "select", selectHtml, onConfirm }); },
};

if (GlobalModal.dateInputEl) {
  GlobalModal.dateInputEl.addEventListener("change", (e) => {
    if (e.target.value) {
      const selectedDate = e.target.value;
      const oldTextWithoutDate = GlobalModal.inputEl.value.replace(/^\d{4}-\d{2}-\d{2}/, '');
      GlobalModal.inputEl.value = selectedDate + oldTextWithoutDate;
      GlobalModal.inputEl.focus();
      const len = GlobalModal.inputEl.value.length;
      GlobalModal.inputEl.setSelectionRange(len, len);
    }
  });
}

window.GlobalModal = GlobalModal;
export default GlobalModal;
