# Slideshow / Carousel Bug Audit

**File:** `server/src/views/landing.pug` (lines 61-86)
**Date:** 2026-02-07
**Reported symptoms:**
1. Hovering initially pauses the slideshow correctly.
2. After some interactions (clicking arrows or dots), bizarre accelerations occur.
3. The slideshow refuses to stop when hovering again.

---

## 1. The Code Under Analysis

```javascript
(function() {
  var current = 1, total = 5, timer;
  var slides = document.querySelectorAll('[data-slide]');
  var dots = document.querySelectorAll('[data-dot]');
  var container = document.querySelector('[data-slide]').parentElement;

  function show(n) {
    current = n < 1 ? total : n > total ? 1 : n;
    slides.forEach(function(s) { s.style.opacity = s.dataset.slide == current ? '1' : '0'; });
    dots.forEach(function(d) { d.style.background = d.dataset.dot == current ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)'; });
  }

  function start() { timer = setInterval(function() { show(current + 1); }, 7000); }
  function stop()  { clearInterval(timer); }
  function restart() { stop(); start(); }

  show(1);
  start();

  // Pause on hover, resume on leave
  container.addEventListener('mouseenter', stop);
  container.addEventListener('mouseleave', start);

  document.querySelectorAll('.stya-slide-arrow').forEach(function(btn) {
    btn.addEventListener('click', function() {
      show(current + (btn.dataset.dir === 'next' ? 1 : -1));
      restart();
    });
  });

  dots.forEach(function(d) {
    d.addEventListener('click', function() {
      show(parseInt(d.dataset.dot));
      restart();
    });
  });
})();
```

---

## 2. Bug Inventory

### Bug #1: Interval stacking -- `start()` never guards against an existing timer

**Severity:** Critical
**Root cause:** `start()` unconditionally calls `setInterval()` and overwrites `timer` with the new interval ID. If a previous interval is still running, its ID is lost and it can never be cleared.

**How it manifests:**

```
State: timer = 42 (one interval running, slides advance every 7 s)

User does: mouseleave  -->  start() is called
  timer = 43           (NEW interval created; interval 42 is still running and now orphaned)

Result: TWO intervals are firing. Slides advance at ~3.5 s effective rate.
```

Every additional unguarded call to `start()` adds another parallel interval. After N leaks, the slideshow advances N+1 times per 7-second window, producing the "bizarre acceleration" the user reported.

**Why `stop()` cannot save you once this happens:**
`stop()` calls `clearInterval(timer)`, but `timer` only holds the *most recent* interval ID. All previously leaked intervals are unreachable and continue firing forever (until the page is unloaded).

---

### Bug #2: `restart()` inside hover zone creates an orphaned interval

**Severity:** Critical
**Root cause:** When the user clicks an arrow or dot *while the mouse is inside the container* (i.e., while hovering), the click handler calls `restart()`, which calls `stop()` then `start()`. This creates a new interval even though the user is hovering and expects the slideshow to be paused.

**Sequence of events:**

```
1. mouseenter         -->  stop()       timer cleared, slideshow paused (correct)
2. user clicks arrow  -->  restart()    stop() + start()  --> new interval created
3. slideshow is now auto-advancing despite the cursor being inside the container
4. mouseleave         -->  start()      ANOTHER interval created (Bug #1 stacking)
5. Now 2 intervals are running
```

Each arrow/dot click while hovering adds one interval. The user sees the slideshow refusing to stop on subsequent hovers because the orphaned intervals from step 2 are never cleared.

---

### Bug #3: `mouseleave` always calls `start()`, even if slideshow was not paused by hover

**Severity:** Moderate
**Root cause:** `mouseleave` is bound to `start()` unconditionally. It does not check whether the slideshow was actually paused by a corresponding `mouseenter`. This means `mouseleave` fires `start()` even if `restart()` already started an interval (from a dot/arrow click), adding a second interval.

**Sequence without any arrow clicks:**

```
1. Page loads         -->  start()      timer = interval_A
2. mouseenter         -->  stop()       interval_A cleared (correct)
3. mouseleave         -->  start()      timer = interval_B (correct so far)
```

This works in the simple case. But as soon as `restart()` enters the picture, `mouseleave` becomes a second source of `start()` calls that compounds Bug #1.

---

### Bug #4: No `isPaused` state tracking

**Severity:** Moderate (design flaw enabling all the above)
**Root cause:** The code has no boolean flag to track whether the slideshow *should* be paused. Without this, `restart()` has no way to know it should not start a new interval, and `mouseleave` has no way to know the interval is already running.

This is the fundamental architectural gap. The Bootstrap carousel historically suffered from the [exact same class of bugs](https://github.com/twbs/bootstrap/issues/3462) and solved it by introducing a `paused` state flag.

---

### Bug #5: `timer` is not nullified after `stop()`

**Severity:** Low (defense-in-depth issue)
**Root cause:** After `clearInterval(timer)`, the variable `timer` still holds the old (now-invalid) numeric ID. While `clearInterval` on a stale ID is a harmless no-op, this makes it impossible to use `timer` as a guard (e.g., `if (timer) return;` in `start()`) without also setting `timer = null` in `stop()`.

---

## 3. Reproduction Scenarios

### Scenario A: Simple acceleration

| Step | Action | Intervals running |
|------|--------|-------------------|
| 0 | Page load, `start()` called | 1 |
| 1 | Mouse enters container | 0 (paused) |
| 2 | Click "next" arrow | 1 (restart created a new one) |
| 3 | Click "next" arrow again | 1 (restart clears and recreates) |
| 4 | Mouse leaves container | **2** (mouseleave calls start again) |
| 5 | Mouse enters container | 1 (stop clears latest, but 1 orphan lives) |
| 6 | Mouse leaves container | **2** (another start) |

The slideshow is now advancing twice as fast and can never be fully paused again.

### Scenario B: Rapid dot clicking while hovering

| Step | Action | Intervals running |
|------|--------|-------------------|
| 0 | Page load | 1 |
| 1 | Mouse enters | 0 |
| 2 | Click dot 3 | 1 |
| 3 | Click dot 1 | 1 (restart clears the one from step 2) |
| 4 | Click dot 5 | 1 |
| 5 | Mouse leaves | **2** |
| 6 | Mouse enters | 1 (one orphan persists) |
| 7 | Mouse leaves | **2** |
| 8 | Repeat enters/leaves | Keeps growing |

### Scenario C: Clicking arrows outside hover zone

| Step | Action | Intervals running |
|------|--------|-------------------|
| 0 | Page load | 1 |
| 1 | Click "next" (cursor on arrow, inside container) | This triggers both the click handler AND potentially mouseenter. restart() creates a new interval. If mouseenter also fires, stop() clears it, but the sequencing depends on event order. |

This is a subtler issue: arrow buttons are *inside* the container, so clicking them can trigger `mouseenter` if the cursor was not already inside, followed by the `click` handler. The exact interaction depends on whether the browser fires `mouseenter` before or after `click`.

---

## 4. Proposed Fix

### Strategy

Introduce an `isPaused` flag and a guarded `start()`/`stop()` pattern that prevents interval stacking and respects hover state during manual navigation.

### Fixed code

```javascript
(function() {
  var current = 1, total = 5, timer = null;
  var isPaused = false;
  var slides = document.querySelectorAll('[data-slide]');
  var dots = document.querySelectorAll('[data-dot]');
  var container = document.querySelector('[data-slide]').parentElement;

  function show(n) {
    current = n < 1 ? total : n > total ? 1 : n;
    slides.forEach(function(s) {
      s.style.opacity = s.dataset.slide == current ? '1' : '0';
    });
    dots.forEach(function(d) {
      d.style.background = d.dataset.dot == current
        ? 'rgba(255,255,255,0.9)'
        : 'rgba(255,255,255,0.3)';
    });
  }

  function start() {
    // Guard: never create a second interval
    if (timer !== null) return;
    timer = setInterval(function() { show(current + 1); }, 7000);
  }

  function stop() {
    clearInterval(timer);
    timer = null;   // allows start() guard to work; allows re-creation later
  }

  function restart() {
    stop();
    // Only restart auto-advance if user is NOT hovering
    if (!isPaused) {
      start();
    }
  }

  show(1);
  start();

  // Pause on hover, resume on leave
  container.addEventListener('mouseenter', function() {
    isPaused = true;
    stop();
  });
  container.addEventListener('mouseleave', function() {
    isPaused = false;
    start();
  });

  // Arrow navigation
  document.querySelectorAll('.stya-slide-arrow').forEach(function(btn) {
    btn.addEventListener('click', function() {
      show(current + (btn.dataset.dir === 'next' ? 1 : -1));
      restart();
    });
  });

  // Dot navigation
  dots.forEach(function(d) {
    d.addEventListener('click', function() {
      show(parseInt(d.dataset.dot));
      restart();
    });
  });
})();
```

### What each change does

| Change | Fixes bug(s) | Explanation |
|--------|-------------|-------------|
| `timer = null` initialization | #5 | Allows null-check guard in `start()`. |
| `if (timer !== null) return;` guard in `start()` | #1, #3 | Prevents creating a second interval if one already exists. This single line eliminates all interval stacking. |
| `timer = null` in `stop()` | #5 | Resets the guard so `start()` can create a new interval when appropriate. |
| `isPaused` flag | #2, #4 | Tracks whether the user is hovering. |
| `restart()` checks `isPaused` | #2 | Arrow/dot clicks while hovering will reset the timer phase but will NOT start a new interval, because the user is still hovering. The interval will start when `mouseleave` fires. |
| `mouseenter` sets `isPaused = true` | #4 | Records that the user intends to pause. |
| `mouseleave` sets `isPaused = false` | #4 | Records that the user has left and auto-advance should resume. |

---

## 5. Explanation of Why the Fix Works in Every Scenario

### Scenario A (fixed): Arrow click while hovering

```
1. mouseenter  -->  isPaused=true, stop()          timer=null, 0 intervals
2. click arrow -->  restart() -> stop() (no-op)
                    isPaused is true -> skip start() 0 intervals (correct!)
3. mouseleave  -->  isPaused=false, start()         timer=X, 1 interval
```

Result: Exactly one interval, no orphans.

### Scenario B (fixed): Multiple dot clicks while hovering

```
1. mouseenter  -->  isPaused=true, stop()           timer=null
2. click dot   -->  restart() -> stop() (no-op)
                    isPaused=true -> skip start()   timer=null
3. click dot   -->  same as above                   timer=null
4. mouseleave  -->  isPaused=false, start()          timer=X, 1 interval
```

Result: Exactly one interval.

### Scenario C (fixed): mouseleave when interval already running

```
1. Page load   -->  start()                          timer=X, 1 interval
2. (cursor is outside, somehow mouseleave fires)
   -->  isPaused=false, start()
   -->  timer !== null, guard triggers, returns     still 1 interval
```

Result: The guard in `start()` prevents the double interval.

---

## 6. Additional Recommendations

### 6.1 Reset the 7-second clock on manual navigation (already done via `restart()`)

When the user clicks an arrow, the `restart()` function resets the interval so the next auto-advance is a full 7 seconds away. This is correct behavior -- without it, if the user clicks at 6.5 seconds, the next auto-advance would happen 0.5 seconds later, which feels jarring.

### 6.2 Consider `setTimeout` chains instead of `setInterval`

A `setTimeout`-based approach eliminates the risk of interval stacking entirely, because each timeout fires only once and must be explicitly rescheduled:

```javascript
function scheduleNext() {
  timer = setTimeout(function() {
    show(current + 1);
    if (!isPaused) scheduleNext();
  }, 7000);
}
```

This is inherently safer because even if `stop()` is missed, no runaway loop occurs -- the chain simply breaks.

### 6.3 Add `visibilitychange` handling

When the browser tab is in the background, `setInterval` is throttled (to once per minute in Chrome). This can cause a burst of queued transitions when the user returns to the tab. Consider pausing on `document.hidden`:

```javascript
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    stop();
  } else if (!isPaused) {
    start();
  }
});
```

### 6.4 Accessibility: respect `prefers-reduced-motion`

Users who have enabled reduced motion in their OS settings should not see auto-advancing slideshows:

```javascript
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Do not auto-start; only allow manual navigation
} else {
  start();
}
```

### 6.5 Keyboard navigation

The slideshow currently has no keyboard support. Consider adding left/right arrow key handlers when the container is focused, and ensuring the dots/arrows are reachable via Tab.

---

## 7. Summary of All Bugs

| # | Bug | Severity | Symptom | Fix |
|---|-----|----------|---------|-----|
| 1 | `start()` has no guard; multiple intervals stack | Critical | Slideshow accelerates | Add `if (timer !== null) return;` guard |
| 2 | `restart()` ignores hover state | Critical | Slideshow runs while hovering after a click | Check `isPaused` before calling `start()` in `restart()` |
| 3 | `mouseleave` unconditionally calls `start()` | Moderate | Extra interval added on leave | Guard in `start()` + `isPaused` flag prevents this |
| 4 | No `isPaused` state flag | Moderate | No way to coordinate hover state with manual navigation | Add `isPaused` boolean |
| 5 | `timer` not nullified after `clearInterval()` | Low | Cannot use `timer` as a reliable guard | Set `timer = null` in `stop()` |

---

## 8. References

- [MDN: setInterval()](https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval) -- return value semantics and clearing
- [MDN: clearInterval()](https://developer.mozilla.org/en-US/docs/Web/API/Window/clearInterval) -- calling with invalid ID is a no-op
- [javascript.info: Scheduling](https://javascript.info/settimeout-setinterval) -- setTimeout chains vs setInterval
- [Bootstrap carousel hover/pause bug #3462](https://github.com/twbs/bootstrap/issues/3462) -- identical class of bugs in Bootstrap's carousel
- [Bootstrap carousel interval stacking #33275](https://github.com/twbs/bootstrap/issues/33275) -- data-interval and data-pause interaction bugs
- [freeCodeCamp: Carousel cancel interval on button click](https://forum.freecodecamp.org/t/carousel-cancel-interval-when-i-click-on-a-btn/504280) -- community discussion of the same pattern
- [SitePoint: clearInterval on hover](https://www.sitepoint.com/community/t/clearinterval-on-hover-resume-on-mouseleave-solved/107469) -- solved pattern for hover pause/resume
- [LogRocket: Build an image carousel from scratch](https://blog.logrocket.com/build-image-carousel-scratch-vanilla-javascript/) -- best practices for vanilla JS carousels
- [Medium: Why JavaScript timer is unreliable](https://abhi9bakshi.medium.com/why-javascript-timer-is-unreliable-and-how-can-you-fix-it-9ff5e6d34ee0) -- background tab throttling
- [Pontis: setInterval breaks when throttled](https://pontistechnology.com/learn-why-setinterval-javascript-breaks-when-throttled/) -- inactive tab behavior
