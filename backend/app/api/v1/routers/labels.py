import uuid

from fastapi import APIRouter, Response

from app.api.deps import CurrentUser, LabelServiceDep

router = APIRouter(prefix="/labels", tags=["labels"])


@router.delete("/{label_id}", status_code=204)
async def delete_label(label_id: uuid.UUID, user: CurrentUser, svc: LabelServiceDep):
    await svc.delete(user.id, label_id)
    return Response(status_code=204)
