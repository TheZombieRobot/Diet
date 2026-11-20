// Stand-in for @minecraft/server-ui: records each form and answers from a queue.
// An answer is one of: a number (button picked, ActionFormData), an array (toggle values, ModalFormData),
// "busy" (UserBusy), "closed" (UserClosed), undefined (nobody answered: closed), or a function returning one of those.
export const __ui = { forms: [], answers: [], all: [] }; // `all` is never cleared
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };

function nextResponse() {
  let answer = __ui.answers.shift();
  if (typeof answer === "function") answer = answer();
  if (answer === "busy") return { canceled: true, cancelationReason: FormCancelationReason.UserBusy };
  if (answer === undefined || answer === "closed") return { canceled: true, cancelationReason: FormCancelationReason.UserClosed };
  return Array.isArray(answer) ? { canceled: false, formValues: answer } : { canceled: false, selection: answer };
}

export class ActionFormData {
  constructor() {
    this.buttons = [];
  }
  title(t) {
    this.titleText = t;
    return this;
  }
  body(b) {
    this.bodyText = b;
    return this;
  }
  button(text) {
    this.buttons.push(text);
    return this;
  }
  show(player) {
    this.player = player;
    __ui.forms.push(this);
    __ui.all.push(this);
    return Promise.resolve(nextResponse());
  }
}

export class ModalFormData {
  constructor() {
    this.toggles = [];
  }
  title(t) {
    this.titleText = t;
    return this;
  }
  toggle(label, options = {}) {
    this.toggles.push({ label, defaultValue: options.defaultValue ?? false });
    return this;
  }
  submitButton(text) {
    this.submitText = text;
    return this;
  }
  show(player) {
    this.player = player;
    __ui.forms.push(this);
    __ui.all.push(this);
    return Promise.resolve(nextResponse());
  }
}
