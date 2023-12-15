!function(){function t(e){return t="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},t(e)}function e(){"use strict";/*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */e=function(){return n};var r,n={},o=Object.prototype,i=o.hasOwnProperty,a=Object.defineProperty||function(t,e,r){t[e]=r.value},c="function"==typeof Symbol?Symbol:{},s=c.iterator||"@@iterator",u=c.asyncIterator||"@@asyncIterator",l=c.toStringTag||"@@toStringTag";function f(t,e,r){return Object.defineProperty(t,e,{value:r,enumerable:!0,configurable:!0,writable:!0}),t[e]}try{f({},"")}catch(r){f=function(t,e,r){return t[e]=r}}function h(t,e,r,n){var o=e&&e.prototype instanceof g?e:g,i=Object.create(o.prototype),c=new P(n||[]);return a(i,"_invoke",{value:k(t,r,c)}),i}function d(t,e,r){try{return{type:"normal",arg:t.call(e,r)}}catch(t){return{type:"throw",arg:t}}}n.wrap=h;var v="suspendedStart",p="executing",y="completed",m={};function g(){}function w(){}function b(){}var x={};f(x,s,(function(){return this}));var _=Object.getPrototypeOf,L=_&&_(_(G([])));L&&L!==o&&i.call(L,s)&&(x=L);var E=b.prototype=g.prototype=Object.create(x);function C(t){["next","throw","return"].forEach((function(e){f(t,e,(function(t){return this._invoke(e,t)}))}))}function j(e,r){function n(o,a,c,s){var u=d(e[o],e,a);if("throw"!==u.type){var l=u.arg,f=l.value;return f&&"object"==t(f)&&i.call(f,"__await")?r.resolve(f.__await).then((function(t){n("next",t,c,s)}),(function(t){n("throw",t,c,s)})):r.resolve(f).then((function(t){l.value=t,c(l)}),(function(t){return n("throw",t,c,s)}))}s(u.arg)}var o;a(this,"_invoke",{value:function(t,e){function i(){return new r((function(r,o){n(t,e,r,o)}))}return o=o?o.then(i,i):i()}})}function k(t,e,n){var o=v;return function(i,a){if(o===p)throw new Error("Generator is already running");if(o===y){if("throw"===i)throw a;return{value:r,done:!0}}for(n.method=i,n.arg=a;;){var c=n.delegate;if(c){var s=S(c,n);if(s){if(s===m)continue;return s}}if("next"===n.method)n.sent=n._sent=n.arg;else if("throw"===n.method){if(o===v)throw o=y,n.arg;n.dispatchException(n.arg)}else"return"===n.method&&n.abrupt("return",n.arg);o=p;var u=d(t,e,n);if("normal"===u.type){if(o=n.done?y:"suspendedYield",u.arg===m)continue;return{value:u.arg,done:n.done}}"throw"===u.type&&(o=y,n.method="throw",n.arg=u.arg)}}}function S(t,e){var n=e.method,o=t.iterator[n];if(o===r)return e.delegate=null,"throw"===n&&t.iterator.return&&(e.method="return",e.arg=r,S(t,e),"throw"===e.method)||"return"!==n&&(e.method="throw",e.arg=new TypeError("The iterator does not provide a '"+n+"' method")),m;var i=d(o,t.iterator,e.arg);if("throw"===i.type)return e.method="throw",e.arg=i.arg,e.delegate=null,m;var a=i.arg;return a?a.done?(e[t.resultName]=a.value,e.next=t.nextLoc,"return"!==e.method&&(e.method="next",e.arg=r),e.delegate=null,m):a:(e.method="throw",e.arg=new TypeError("iterator result is not an object"),e.delegate=null,m)}function O(t){var e={tryLoc:t[0]};1 in t&&(e.catchLoc=t[1]),2 in t&&(e.finallyLoc=t[2],e.afterLoc=t[3]),this.tryEntries.push(e)}function $(t){var e=t.completion||{};e.type="normal",delete e.arg,t.completion=e}function P(t){this.tryEntries=[{tryLoc:"root"}],t.forEach(O,this),this.reset(!0)}function G(e){if(e||""===e){var n=e[s];if(n)return n.call(e);if("function"==typeof e.next)return e;if(!isNaN(e.length)){var o=-1,a=function t(){for(;++o<e.length;)if(i.call(e,o))return t.value=e[o],t.done=!1,t;return t.value=r,t.done=!0,t};return a.next=a}}throw new TypeError(t(e)+" is not iterable")}return w.prototype=b,a(E,"constructor",{value:b,configurable:!0}),a(b,"constructor",{value:w,configurable:!0}),w.displayName=f(b,l,"GeneratorFunction"),n.isGeneratorFunction=function(t){var e="function"==typeof t&&t.constructor;return!!e&&(e===w||"GeneratorFunction"===(e.displayName||e.name))},n.mark=function(t){return Object.setPrototypeOf?Object.setPrototypeOf(t,b):(t.__proto__=b,f(t,l,"GeneratorFunction")),t.prototype=Object.create(E),t},n.awrap=function(t){return{__await:t}},C(j.prototype),f(j.prototype,u,(function(){return this})),n.AsyncIterator=j,n.async=function(t,e,r,o,i){void 0===i&&(i=Promise);var a=new j(h(t,e,r,o),i);return n.isGeneratorFunction(e)?a:a.next().then((function(t){return t.done?t.value:a.next()}))},C(E),f(E,l,"Generator"),f(E,s,(function(){return this})),f(E,"toString",(function(){return"[object Generator]"})),n.keys=function(t){var e=Object(t),r=[];for(var n in e)r.push(n);return r.reverse(),function t(){for(;r.length;){var n=r.pop();if(n in e)return t.value=n,t.done=!1,t}return t.done=!0,t}},n.values=G,P.prototype={constructor:P,reset:function(t){if(this.prev=0,this.next=0,this.sent=this._sent=r,this.done=!1,this.delegate=null,this.method="next",this.arg=r,this.tryEntries.forEach($),!t)for(var e in this)"t"===e.charAt(0)&&i.call(this,e)&&!isNaN(+e.slice(1))&&(this[e]=r)},stop:function(){this.done=!0;var t=this.tryEntries[0].completion;if("throw"===t.type)throw t.arg;return this.rval},dispatchException:function(t){if(this.done)throw t;var e=this;function n(n,o){return c.type="throw",c.arg=t,e.next=n,o&&(e.method="next",e.arg=r),!!o}for(var o=this.tryEntries.length-1;o>=0;--o){var a=this.tryEntries[o],c=a.completion;if("root"===a.tryLoc)return n("end");if(a.tryLoc<=this.prev){var s=i.call(a,"catchLoc"),u=i.call(a,"finallyLoc");if(s&&u){if(this.prev<a.catchLoc)return n(a.catchLoc,!0);if(this.prev<a.finallyLoc)return n(a.finallyLoc)}else if(s){if(this.prev<a.catchLoc)return n(a.catchLoc,!0)}else{if(!u)throw new Error("try statement without catch or finally");if(this.prev<a.finallyLoc)return n(a.finallyLoc)}}}},abrupt:function(t,e){for(var r=this.tryEntries.length-1;r>=0;--r){var n=this.tryEntries[r];if(n.tryLoc<=this.prev&&i.call(n,"finallyLoc")&&this.prev<n.finallyLoc){var o=n;break}}o&&("break"===t||"continue"===t)&&o.tryLoc<=e&&e<=o.finallyLoc&&(o=null);var a=o?o.completion:{};return a.type=t,a.arg=e,o?(this.method="next",this.next=o.finallyLoc,m):this.complete(a)},complete:function(t,e){if("throw"===t.type)throw t.arg;return"break"===t.type||"continue"===t.type?this.next=t.arg:"return"===t.type?(this.rval=this.arg=t.arg,this.method="return",this.next="end"):"normal"===t.type&&e&&(this.next=e),m},finish:function(t){for(var e=this.tryEntries.length-1;e>=0;--e){var r=this.tryEntries[e];if(r.finallyLoc===t)return this.complete(r.completion,r.afterLoc),$(r),m}},catch:function(t){for(var e=this.tryEntries.length-1;e>=0;--e){var r=this.tryEntries[e];if(r.tryLoc===t){var n=r.completion;if("throw"===n.type){var o=n.arg;$(r)}return o}}throw new Error("illegal catch attempt")},delegateYield:function(t,e,n){return this.delegate={iterator:G(t),resultName:e,nextLoc:n},"next"===this.method&&(this.arg=r),m}},n}function r(t,e,r,n,o,i,a){try{var c=t[i](a),s=c.value}catch(u){return void r(u)}c.done?e(s):Promise.resolve(s).then(n,o)}var n=document.createElement("style");n.innerHTML=".card-finished[data-v-1f500044]{height:275px}\n",document.head.appendChild(n),System.register(["./v-broker-legacy.c00e88c7.js","./v-alphainsider-legacy.4f6a31a5.js","./v-strategy-select-legacy.3efea25b.js","./index-legacy.155ebaeb.js","./v-dropdown-menu-legacy.01529642.js"],(function(t){"use strict";var n,o,i,a;return{setters:[function(t){n=t.v},function(t){o=t.v},function(t){i=t.v},function(t){a=t.n},function(){}],execute:function(){var c={components:{vBroker:n,vAlphainsider:o,vStrategySelect:i},mounted:function(){var t,n=this;return(t=e().mark((function t(){return e().wrap((function(t){for(;;)switch(t.prev=t.next){case 0:return t.next=2,n.$store.dispatch("getBotInfo");case 2:return t.next=4,n.$store.dispatch("getAllocation");case 4:case"end":return t.stop()}}),t)})),function(){var e=this,n=arguments;return new Promise((function(o,i){var a=t.apply(e,n);function c(t){r(a,o,i,c,s,"next",t)}function s(t){r(a,o,i,c,s,"throw",t)}c(void 0)}))})()}},s={},u=a(c,(function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("div",{staticClass:"container d-flex align-items-center justify-content-center min-vh-100 my-3 my-lg-4"},[r("div",{staticClass:"row no-gutters justify-content-center w-100"},[r("div",{staticClass:"col-11 col-md-6"},[t.$_.isEmpty(t.$store.state.bot)?r("div",{staticClass:"d-flex flex-column align-items-center"},[r("h4",[t._v("Loading...")])]):t.$store.state.bot.broker?t.$store.state.bot.alphainsider?t.$store.state.allocation.length<=0?r("div",{staticClass:"card shadow-sm"},[r("div",{staticClass:"card"},[t._m(2),r("div",{staticClass:"card-body p-3"},[r("v-strategy-select",{on:{update:function(e){return t.loadBot()}}})],1)])]):r("div",{staticClass:"card card-finished shadow-sm"},[r("div",{staticClass:"card-body d-flex align-items-center justify-content-center"},[r("div",{staticClass:"row justify-content-center w-100"},[r("div",{staticClass:"col-12 col-lg-8 text-center"},[r("h1",[t._v("You're all set!")]),r("router-link",{staticClass:"btn btn-primary btn-block",attrs:{to:"/",replace:""}},[t._v("Finish")])],1)])])]):r("div",{staticClass:"card shadow-sm"},[r("div",{staticClass:"card"},[t._m(1),r("div",{staticClass:"card-body p-3"},[r("v-alphainsider",{on:{update:function(e){return t.loadBot()}}})],1)])]):r("div",{staticClass:"card shadow-sm"},[r("div",{staticClass:"card"},[t._m(0),r("div",{staticClass:"card-body p-3"},[r("v-broker",{on:{update:function(e){return t.loadBot()}}})],1)])])])])])}),[function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("div",{staticClass:"card-header bg-white d-flex align-items-center p-3"},[r("h5",{staticClass:"text-primary mb-0"},[t._v("Connect Brokerage")])])},function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("div",{staticClass:"card-header bg-white d-flex align-items-center p-3"},[r("h5",{staticClass:"text-primary mb-0"},[t._v("Connect AlphaInsider")])])},function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("div",{staticClass:"card-header bg-white d-flex align-items-center p-3"},[r("h5",{staticClass:"text-primary mb-0"},[t._v("Strategy Select")])])}],!1,l,"1f500044",null,null);function l(t){for(var e in s)this[e]=s[e]}t("default",function(){return u.exports}())}}}))}();