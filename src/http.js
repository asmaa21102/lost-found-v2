// Small helpers for request validation and JSON errors.
class HttpError extends Error {
  constructor(status, message, fields = null) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const fail = (status, message, fields) => {
  throw new HttpError(status, message, fields);
};

// Collects field errors so a form can show all problems at once.
class Check {
  constructor(source) {
    this.src = source || {};
    this.errors = {};
    this.out = {};
  }
  text(name, { required = false, min = 0, max = 255, label = name, multiline = false } = {}) {
    let v = this.src[name];
    v = v == null ? "" : String(v);
    v = multiline ? v.replace(/\r\n/g, "\n").trim() : v.replace(/\s+/g, " ").trim();
    if (!v) {
      if (required) this.errors[name] = `${label} is required`;
      this.out[name] = null;
    } else if (v.length < min) this.errors[name] = `${label} must be at least ${min} characters`;
    else if (v.length > max) this.errors[name] = `${label} must be at most ${max} characters`;
    else this.out[name] = v;
    return this;
  }
  oneOf(name, allowed, { required = false, label = name } = {}) {
    const v = this.src[name] == null || this.src[name] === "" ? null : String(this.src[name]);
    if (v == null) {
      if (required) this.errors[name] = `${label} is required`;
      this.out[name] = null;
    } else if (!(allowed instanceof Set ? allowed.has(v) : allowed.includes(v))) this.errors[name] = `Choose a valid ${label.toLowerCase()}`;
    else this.out[name] = v;
    return this;
  }
  date(name, { required = false, label = name, notFuture = true } = {}) {
    const v = this.src[name];
    if (!v) {
      if (required) this.errors[name] = `${label} is required`;
      this.out[name] = null;
      return this;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) this.errors[name] = `${label} is not a valid date`;
    else if (notFuture && new Date(v) > new Date(Date.now() + 86400000)) this.errors[name] = `${label} can't be in the future`;
    else this.out[name] = v;
    return this;
  }
  number(name, { min = -Infinity, max = Infinity, label = name } = {}) {
    const v = this.src[name];
    if (v === undefined || v === null || v === "") {
      this.out[name] = null;
      return this;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) this.errors[name] = `${label} is out of range`;
    else this.out[name] = n;
    return this;
  }
  bool(name) {
    const v = this.src[name];
    this.out[name] = v === true || v === "true" || v === "1" || v === 1 || v === "on";
    return this;
  }
  email(name, { required = true } = {}) {
    this.text(name, { required, max: 150, label: "Email" });
    if (this.out[name]) {
      this.out[name] = this.out[name].toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.out[name])) this.errors[name] = "Enter a valid email address";
    }
    return this;
  }
  done() {
    if (Object.keys(this.errors).length) fail(422, "Please fix the highlighted fields", this.errors);
    return this.out;
  }
}

const check = (src) => new Check(src);

const intParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(404, "Not found");
  return n;
};

module.exports = { HttpError, fail, check, intParam };
