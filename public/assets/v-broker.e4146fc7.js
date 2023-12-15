import{n}from"./index.5c21033f.js";var o=function(){var t=this,r=t.$createElement,a=t._self._c||r;return a("div",[a("div",{staticClass:"row"},[a("div",{staticClass:"col-12 d-flex justify-content-center"},[a("div",{staticClass:"option-select card mr-3",class:{active:t.broker==="alpaca"},on:{click:function(l){t.broker="alpaca"}}},[t._m(0),t._m(1)]),a("div",{staticClass:"option-select card",class:{active:t.broker==="tastytrade"},on:{click:function(l){t.broker="tastytrade"}}},[t._m(2),t._m(3)])])]),t.broker==="alpaca"?a("div",{staticClass:"mt-3"},[a("validation-observer",{scopedSlots:t._u([{key:"default",fn:function(l){return[a("form",{on:{submit:function(s){s.preventDefault(),l.handleSubmit(function(){return t.updateBroker(l)})}}},[a("div",{staticClass:"row justify-content-center mb-3"},[a("div",{staticClass:"col-12 pt-2"},[a("h6",{staticClass:"m-0"},[t._v("Public Key")])]),a("div",{staticClass:"col-12"},[a("validation-provider",{attrs:{name:"Alpaca public key",rules:"required"},scopedSlots:t._u([{key:"default",fn:function(s){var e=s.errors;return[a("input-mask",{staticClass:"form-control",class:{"is-invalid":e.length},attrs:{mask:/^\S+$/,type:"text"},model:{value:t.alpacaKey,callback:function(i){t.alpacaKey=i},expression:"alpacaKey"}}),a("div",{staticClass:"invalid-feedback"},[t._v(t._s(e[0]))])]}}],null,!0)})],1)]),a("div",{staticClass:"row justify-content-center mb-3"},[a("div",{staticClass:"col-12 pt-2"},[a("h6",{staticClass:"m-0"},[t._v("Private Key")])]),a("div",{staticClass:"col-12"},[a("validation-provider",{attrs:{name:"Alpaca private key",rules:"required"},scopedSlots:t._u([{key:"default",fn:function(s){var e=s.errors;return[a("input-mask",{staticClass:"form-control",class:{"is-invalid":e.length},attrs:{mask:/^\S+$/,type:"text"},model:{value:t.alpacaSecret,callback:function(i){t.alpacaSecret=i},expression:"alpacaSecret"}}),a("div",{staticClass:"invalid-feedback"},[t._v(t._s(e[0]))])]}}],null,!0)})],1)]),a("div",{staticClass:"row mt-3 mt-md-0"},[a("div",{staticClass:"col-12 d-flex justify-content-end"},[a("router-link",{staticClass:"btn btn-light border mr-2",attrs:{to:"/broker-tutorial"}},[t._v("Help")]),a("button",{staticClass:"btn btn-primary",attrs:{type:"submit"}},[t._v("Save")])],1)])])]}}],null,!1,3605082419)})],1):t.broker==="tastytrade"?a("div",{staticClass:"mt-3"},[a("validation-observer",{scopedSlots:t._u([{key:"default",fn:function(l){return[a("form",{on:{submit:function(s){s.preventDefault(),l.handleSubmit(function(){return t.updateBroker(l)})}}},[a("div",{staticClass:"row mb-3"},[a("div",{staticClass:"col-12 pt-2"},[a("h6",{staticClass:"m-0"},[t._v("Email")])]),a("div",{staticClass:"col-12"},[a("validation-provider",{attrs:{name:"email",rules:"email|required"},scopedSlots:t._u([{key:"default",fn:function(s){var e=s.errors;return[a("input-mask",{staticClass:"form-control",class:{"is-invalid":e.length},attrs:{mask:/^\S+$/,type:"text"},model:{value:t.tastyTradeEmail,callback:function(i){t.tastyTradeEmail=i},expression:"tastyTradeEmail"}}),a("div",{staticClass:"invalid-feedback"},[t._v(t._s(e[0]))])]}}],null,!0)})],1)]),a("div",{staticClass:"row mb-3"},[a("div",{staticClass:"col-12 pt-2"},[a("h6",{staticClass:"m-0"},[t._v("Password")])]),a("div",{staticClass:"col-12"},[a("validation-provider",{attrs:{name:"TastyTrade Password",rules:"required"},scopedSlots:t._u([{key:"default",fn:function(s){var e=s.errors;return[a("input",{directives:[{name:"model",rawName:"v-model",value:t.tastyTradePassword,expression:"tastyTradePassword"}],staticClass:"form-control",class:{"is-invalid":e.length},attrs:{type:"password",placeholder:"Password"},domProps:{value:t.tastyTradePassword},on:{input:function(i){i.target.composing||(t.tastyTradePassword=i.target.value)}}}),a("div",{staticClass:"invalid-feedback"},[t._v(t._s(e[0]))])]}}],null,!0)})],1)]),a("label",[t._v("Account ID")]),a("div",{staticClass:"form-group mb-2"},[a("validation-provider",{attrs:{name:"account_id",rules:"required"},scopedSlots:t._u([{key:"default",fn:function(s){var e=s.errors;return[a("input-mask",{staticClass:"form-control",class:{"is-invalid":e.length},attrs:{mask:/^\S+$/,type:"text"},model:{value:t.tastyTradeAccountId,callback:function(i){t.tastyTradeAccountId=i},expression:"tastyTradeAccountId"}}),a("div",{staticClass:"invalid-feedback"},[t._v(t._s(e[0]))])]}}],null,!0)})],1),a("div",{staticClass:"row mt-3 mt-md-0"},[a("div",{staticClass:"col-12 d-flex justify-content-end"},[a("router-link",{staticClass:"btn btn-light border mr-2",attrs:{to:"/broker-tutorial"}},[t._v("Help")]),a("button",{staticClass:"btn btn-primary",attrs:{type:"submit"}},[t._v("Save")])],1)])])]}}])})],1):t._e()])},d=[function(){var t=this,r=t.$createElement,a=t._self._c||r;return a("div",{staticClass:"card-body d-flex flex-column align-items-center justify-content-around bg-white"},[a("img",{attrs:{src:"/img/brokers/alpaca-logo.png",alt:"Alpaca",width:"54"}})])},function(){var t=this,r=t.$createElement,a=t._self._c||r;return a("div",{staticClass:"card-footer text-center"},[a("h6",{staticClass:"mb-0"},[t._v("Alpaca")])])},function(){var t=this,r=t.$createElement,a=t._self._c||r;return a("div",{staticClass:"card-body d-flex flex-column align-items-center justify-content-around bg-white"},[a("img",{attrs:{src:"/img/brokers/tastytrade-logo.svg",alt:"TastyTrade",width:"100"}})])},function(){var t=this,r=t.$createElement,a=t._self._c||r;return a("div",{staticClass:"card-footer text-center"},[a("h6",{staticClass:"mb-0"},[t._v("TastyTrade")])])}];const u={data(){return{broker:"alpaca",alpacaKey:void 0,alpacaSecret:void 0,tastyTradeEmail:void 0,tastyTradePassword:void 0,tastyTradeAccountId:void 0}},methods:{updateBroker(){return this.broker==="alpaca"?this.$store.dispatch("request",{type:"post",auth:!0,url:"updateBrokerAlpaca",query:{alpaca_key:this.alpacaKey,alpaca_secret:this.alpacaSecret}}).then(()=>{this.$emit("update")}).catch(()=>{toastr.error("Failed to update Alpaca API key.")}):this.$store.dispatch("request",{type:"post",auth:!0,url:"updateBrokerTastytrade",query:{tastytrade_email:this.tastyTradeEmail,tastytrade_password:this.tastyTradePassword,account_id:this.tastyTradeAccountId}}).then(()=>{this.$emit("update")}).catch(()=>{toastr.error("Failed to update TastyTrade API key.")})}}},c={};var v=n(u,o,d,!1,m,null,null,null);function m(t){for(let r in c)this[r]=c[r]}var f=function(){return v.exports}();export{f as v};
