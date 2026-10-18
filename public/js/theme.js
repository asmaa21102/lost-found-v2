// Runs before the page paints so there is no flash of the wrong theme.
(function () {
  var theme = null;
  try { theme = localStorage.getItem("lf-theme"); } catch (e) {}
  // The original cream look is the default; dark (espresso) is one click away.
  if (theme !== "light" && theme !== "dark") theme = "light";
  document.documentElement.setAttribute("data-theme", theme);
})();
