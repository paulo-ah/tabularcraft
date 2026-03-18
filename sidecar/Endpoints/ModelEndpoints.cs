using Tabularcraft.Sidecar.Services;
using Tabularcraft.Sidecar.Models;

namespace Tabularcraft.Sidecar.Endpoints;

public static class ModelEndpoints
{
    public static void MapModelEndpoints(this WebApplication app)
    {
        app.MapGet("/model/databases", (AasConnectionService svc) =>
        {
            try
            {
                return Results.Ok(svc.GetDatabases());
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/model/rename", (RenameObjectRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.RenameObject(request);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/model/delete", (DeleteObjectRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.DeleteObject(request);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/model/properties/get", (GetObjectPropertiesRequest request, AasConnectionService svc) =>
        {
            try
            {
                return Results.Ok(svc.GetObjectProperties(request));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/model/properties/update", (UpdateObjectPropertiesRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.UpdateObjectProperties(request);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/model/columns/data/create", (CreateDataColumnRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.CreateDataColumn(request);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/model/columns/calculated/create", (CreateCalculatedColumnRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.CreateCalculatedColumn(request);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });
    }
}
