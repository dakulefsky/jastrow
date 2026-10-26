/* Show the dictionary after Otzaria supplies its theme, with a fallback for standalone use. */
(function(){var shown=false;function reveal(){if(shown)return;shown=true;document.body.style.visibility="visible";}if(window.Otzaria){Otzaria.on("plugin.boot",function(){requestAnimationFrame(reveal);});}else{requestAnimationFrame(reveal);}setTimeout(reveal,700);})();
