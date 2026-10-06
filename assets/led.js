/* LED Detailing: package toggles + "Book" buttons that pre-select the package in the booking form */
(function () {
  "use strict";
  var KEY = "led-pkg";
  document.querySelectorAll(".pk").forEach(function (card) {
    var btns = card.querySelectorAll(".pk-toggle button");
    var opts = card.querySelectorAll(".pk-opt");
    var cta = card.querySelector(".pk-book");
    function show(key) {
      var active;
      opts.forEach(function (o) { var on = o.getAttribute("data-opt") === key; o.hidden = !on; if (on) active = o; });
      btns.forEach(function (b) { var on = b.getAttribute("data-opt") === key; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      if (active && cta) {
        var label = active.getAttribute("data-book");           // e.g. "Platinum Interior ($100)"
        var m = label.match(/^(.*) \((\$\d+)\)$/);
        cta.textContent = m ? "Book " + m[1].replace(":", " ·").replace(" · sedan/SUV", "").replace(" · truck", " (Truck)") + " · " + m[2] : "Book Now";
        cta.setAttribute("data-book", label);
      }
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-opt")); }); });
    if (btns[0]) show(btns[0].getAttribute("data-opt"));
    if (cta) cta.addEventListener("click", function () {
      var v = cta.getAttribute("data-book");
      try { sessionStorage.setItem(KEY, v); } catch (e) {}
      select(v);
    });
  });
  function select(v) {
    var s = document.querySelector("#booking-form select[name=service]");
    if (!s || !v) return;
    for (var i = 0; i < s.options.length; i++) if (s.options[i].text === v) { s.selectedIndex = i; break; }
  }
  try { select(sessionStorage.getItem(KEY)); } catch (e) {}
})();
