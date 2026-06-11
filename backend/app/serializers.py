# 이건 전체 추가
from rest_framework import serializers
from .models import Info

class InfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Info
        fields = '__all__'