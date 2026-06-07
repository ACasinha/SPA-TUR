'use strict';
(function() {
  window.__views = window.__views || {};
  window.__views['editor'] = {
    mount:   function(perfil) { spaSetHeader({ titulo: 'editor' }); },
    unmount: function()       { spaResetHeader(); }
  };
})();