$.fn.clicktoggle = function(a, b) {
    return this.each(function() {
        var clicked = false;
        $(this).click(function() {
            if (clicked) {
                clicked = false;
                return b.apply(this, arguments);
            }
            clicked = true;
            return a.apply(this, arguments);
        });
    });
};

$(document).ready(function(){
	$("#toggle").clicktoggle(function () {
		$(this).parent().animate({ right: '0px' }, {queue: false, duration: 500});
		$("#toggle").css("background","url('/stylesheets/assets/togglePanel.png') no-repeat 0");
	} , function(){
        	$(this).parent().animate({ right: '-320px' }, {queue: false, duration: 500});
		$("#toggle").css("background","url('/stylesheets/assets/togglePanelInverted.png') no-repeat 0");
    });
});
