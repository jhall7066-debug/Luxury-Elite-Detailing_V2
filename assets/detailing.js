/* Detailing layer interactions — load AFTER script.js */
(function () {
  "use strict";

  /* Before/after drag sliders: the range input drives the --pos custom property */
  document.querySelectorAll(".ba-slider").forEach(function (s) {
    var r = s.querySelector("input[type=range]");
    if (!r) return;
    function set() { s.style.setProperty("--pos", r.value + "%"); }
    r.addEventListener("input", set);
    set();
  });

  /* Preferred-date field can't be set in the past */
  var d = document.querySelector('#booking-form input[type=date]');
  if (d) d.min = new Date().toISOString().split("T")[0];
})();
