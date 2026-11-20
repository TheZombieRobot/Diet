// Stand-in for @minecraft/server-ui: records each form and answers from a queue.
export const __ui = { forms: [], answers: [] };
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
  show() {
    __ui.forms.push(this);
    const selection = __ui.answers.shift();
    return Promise.resolve(selection === undefined ? { canceled: true } : { canceled: false, selection });
  }
}
