// Interior points are sampled in the element's local border box, then projected
// by the browser. A slanted quadrilateral's axis-aligned corners are not its face.
export const projectedSampleScript = `window.mahjongPhysicalSamples = function(element, positions) {
  var originalStyle = element.getAttribute('style');
  var border = getComputedStyle(element);
  var left = parseFloat(border.borderLeftWidth) || 0;
  var top = parseFloat(border.borderTopWidth) || 0;
  var width = parseFloat(border.width) || element.offsetWidth;
  var height = parseFloat(border.height) || element.offsetHeight;
  if (border.boxSizing !== 'border-box') {
    width += left + (parseFloat(border.borderRightWidth) || 0) + (parseFloat(border.paddingLeft) || 0) + (parseFloat(border.paddingRight) || 0);
    height += top + (parseFloat(border.borderBottomWidth) || 0) + (parseFloat(border.paddingTop) || 0) + (parseFloat(border.paddingBottom) || 0);
  }
  var marker = document.createElement('span');
  marker.setAttribute('aria-hidden', 'true');
  // A reduced-motion duration rule also gives otherwise unanimated markers a
  // tiny transition on every property. Measurements within one JS task must
  // move immediately rather than repeatedly returning the first sample point.
  marker.style.cssText = 'position:absolute!important;width:0!important;height:0!important;padding:0!important;margin:0!important;border:0!important;pointer-events:none!important;visibility:hidden!important;transition:none!important;animation:none!important;';
  try {
    if (border.position === 'static') element.style.position = 'relative';
    element.appendChild(marker);
    return (positions || [[.16,.16],[.84,.16],[.5,.5],[.16,.84],[.84,.84]]).map(function(pair) {
      marker.style.left = (width * pair[0] - left) + 'px';
      marker.style.top = (height * pair[1] - top) + 'px';
      var point = marker.getBoundingClientRect();
      return {x:point.left,y:point.top,u:pair[0],v:pair[1]};
    });
  } finally {
    marker.remove();
    if (originalStyle === null) element.removeAttribute('style');
    else element.setAttribute('style',originalStyle);
  }
};`;
