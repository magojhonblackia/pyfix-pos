from pydantic import BaseModel


class SupplierCreate(BaseModel):
    name: str
    nit:          str | None = None
    contact_name: str | None = None
    phone:        str | None = None
    email:        str | None = None
    address:      str | None = None


class SupplierUpdate(BaseModel):
    name:         str | None = None
    nit:          str | None = None
    contact_name: str | None = None
    phone:        str | None = None
    email:        str | None = None
    address:      str | None = None


class SupplierResponse(BaseModel):
    id:           str
    name:         str
    nit:          str | None
    contact_name: str | None
    phone:        str | None
    email:        str | None
    address:      str | None
