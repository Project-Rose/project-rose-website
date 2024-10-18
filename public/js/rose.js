$(document).ready(function () {
    $(".confirm-twttr").on("click", function(evt) {
        evt.preventDefault();
        var code = $(".twttr-code-value").val();

        window.location.href="/tvii/checkForTWRedirect?code=" + code;
    })

    $(".confirm-tumblr").on("click", function(evt) {
        evt.preventDefault();
        var code = $(".tumblr-code-value").val();

        window.location.href="/tvii/checkForTBRedirect?code=" + code;
    })
});