import{n as i}from"./index.5c21033f.js";var r=function(){var t=this,a=t.$createElement,s=t._self._c||a;return s("div",[s("div",{staticClass:"card mb-3",class:t.accountSubscription.type==="premium"?"border-info img-head-premium":t.accountSubscription.type==="pro"?"border-success img-head-pro":"border-warning img-head-standard"},[s("div",{staticClass:"card-body"},[s("div",{staticClass:"row"},[s("div",{staticClass:"col col-md-8 text-white"},[s("label",[t._v("Account Tier")]),s("h1",{staticClass:"text-capitalize m-0"},[t._v(t._s(t.accountSubscription.type||"standard"))])]),s("div",{staticClass:"col align-self-center"},[s("a",{staticClass:"btn btn-light bg-light btn-block",class:(t.accountSubscription.type==="premium"?"text-info":t.accountSubscription.type==="pro"?"text-success":"text-warning")+" "+(t.$store.getters.isMobileView?"":"btn-lg"),attrs:{href:"https://alphainsider.com/account-pricing",target:"_blank"}},[t._v("View Plans")])])])])]),s("div",{staticClass:"card"},[t._m(0),s("div",{staticClass:"card-body"},[s("div",{staticClass:"d-flex align-items-center"},[t._m(1),s("div",{staticClass:"ml-auto"},[s("router-link",{staticClass:"btn btn-outline-primary",attrs:{to:"/password-tutorial"}},[t._v("Guide")])],1)])])])])},c=[function(){var t=this,a=t.$createElement,s=t._self._c||a;return s("div",{staticClass:"d-flex card-header bg-white"},[s("h5",{staticClass:"text-primary mb-0"},[t._v("Change Password")])])},function(){var t=this,a=t.$createElement,s=t._self._c||a;return s("div",[s("p",{staticClass:"mb-0"},[t._v("Password Guide")]),s("small",{staticClass:"text-muted"},[t._v("Follow this guide to change your password.")])])}];const n={data(){return{accountSubscription:{type:"pro"}}},mounted(){},methods:{}},e={};var o=i(n,r,c,!1,l,null,null,null);function l(t){for(let a in e)this[a]=e[a]}var u=function(){return o.exports}();export{u as default};