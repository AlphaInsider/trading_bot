import{n}from"./index.ffd2517c.js";var s=function(){var t=this,e=t.$createElement,o=t._self._c||e;return o("span",{attrs:{title:t.$moment(t.date).format("LLL")}},[t._v(t._s(t.computedTime))])},a=[];const m={components:{},props:{date:{type:String,default:()=>moment().toISOString()},fullDate:{type:Boolean,default:!1}},data(){return{timeNow:Date.now(),interval:void 0}},computed:{computedTime(){this.timeNow=this.timeNow+"";let t=moment(this.date);return this.fullDate?t.format("MMM DD, YYYY [at] h:mma"):t.isAfter(moment().subtract(1,"hours"))?t.fromNow():t.isAfter(moment().subtract(2,"hours"))?moment().diff(t,"hours")+" hr ago":t.isAfter(moment().subtract(24,"hours"))?moment().diff(t,"hours")+" hrs ago":t.format("MMM DD, YYYY")}},mounted(){moment(this.date).isAfter(moment().subtract(24,"hours"))&&(this.interval=setInterval(()=>{this.timeNow=Date.now()},1e4))},beforeDestroy(){clearInterval(this.interval)}},r={};var i=n(m,s,a,!1,u,null,null,null);function u(t){for(let e in r)this[e]=r[e]}var f=function(){return i.exports}();export{f as v};