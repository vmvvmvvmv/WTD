from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Users
from .models import Info


# Register your models here.
class CustomUserAdmin(UserAdmin):
    model = Users
    list_display = ('id', 'user_id', 'email', 'nickname', 'is_staff', 'is_active')
    list_filter = ('is_staff', 'is_active')
    fieldsets = (
        (None, {'fields': ('user_id', 'password')}),
        ('Personal Info', {'fields': ('email', 'nickname')}),
        ('Permissions', {'fields': ('is_staff', 'is_active', 'is_superuser')}),
        ('Important dates', {'fields': ('last_login',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('user_id', 'password', 'is_staff', 'is_active')}
         ),
    )
    search_fields = ('user_id', 'email')
    ordering = ('user_id',)
    filter_horizontal = ('groups', 'user_permissions')


admin.site.register(Users, CustomUserAdmin)
#추가가
admin.site.register(Info)