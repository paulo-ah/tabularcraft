using Tabularcraft.Sidecar.Endpoints;
using Tabularcraft.Sidecar.Services;

var builder = WebApplication.CreateBuilder(args);

// Listen on a random available port; the chosen port is printed to stdout
// so the VS Code extension can discover it.
builder.WebHost.UseUrls("http://127.0.0.1:0");

builder.Services.AddSingleton<AasConnectionService>();

var app = builder.Build();

// Register all endpoint groups
app.MapConnectionEndpoints();
app.MapModelEndpoints();
app.MapProcessEndpoints();
app.MapMeasureEndpoints();
app.MapTmslEndpoints();

// Health check used by the extension to verify the sidecar is alive.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

await app.StartAsync();

// Print the actual bound port so the extension can connect.
var address = app.Urls.First();
var port = new Uri(address).Port;
Console.WriteLine($"Listening on port {port}");
Console.Out.Flush();

await app.WaitForShutdownAsync();
