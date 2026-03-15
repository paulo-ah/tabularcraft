using Tabularcraft.Sidecar.Models;
using Tabularcraft.Sidecar.Services;

namespace Tabularcraft.Sidecar.Endpoints;

public static class ConnectionEndpoints
{
    public static void MapConnectionEndpoints(this WebApplication app)
    {
        app.MapPost("/connection/connect", (ConnectRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.Connect(request);
                return Results.Ok(new { connected = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/connection/disconnect", (AasConnectionService svc) =>
        {
            svc.Disconnect();
            return Results.Ok(new { connected = false });
        });

        app.MapGet("/connection/status", (AasConnectionService svc) =>
            Results.Ok(new { connected = svc.IsConnected }));
    }
}
