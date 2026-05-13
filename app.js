(function () {
  // This will only run if app.js is actually executed
  const el = document.getElementById("jsApp");
  if (el) {
    el.textContent = "JS (app.js): RUNNING ✅";
    el.classList.remove("bad");
    el.classList.add("good");
  }
})();
